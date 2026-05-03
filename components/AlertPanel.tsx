"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Trash2, Edit2, Check, X, Bell } from "lucide-react";

interface Alert {
  id: string;
  type: "percent" | "krw";
  condition_type: "gte" | "lte";
  value: number;
  is_recurring: boolean;
  interval_minutes: number;
  enabled: boolean;
}

export default function AlertPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [formType, setFormType] = useState<"percent" | "krw">("krw");
  const [formCondition, setFormCondition] = useState<"gte" | "lte">("gte");
  const [formValue, setFormValue] = useState("");
  const [formInterval, setFormInterval] = useState<string>("0"); // 0: 1회, 10, 60, 240

  useEffect(() => {
    if (isOpen) {
      fetchAlerts();
    }
  }, [isOpen]);

  async function fetchAlerts() {
    setLoading(true);
    const { data, error } = await supabase.from("kimp_alerts").select("*").order("created_at", { ascending: false });
    if (!error && data) {
      setAlerts(data as Alert[]);
    }
    setLoading(false);
  }

  async function handleToggle(id: string, currentStatus: boolean) {
    const { error } = await supabase.from("kimp_alerts").update({ enabled: !currentStatus }).eq("id", id);
    if (!error) {
      setAlerts(alerts.map(a => a.id === id ? { ...a, enabled: !currentStatus } : a));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("알림을 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("kimp_alerts").delete().eq("id", id);
    if (!error) {
      setAlerts(alerts.filter(a => a.id !== id));
    }
  }

  function openEditForm(alert: Alert) {
    setFormType(alert.type);
    setFormCondition(alert.condition_type);
    setFormValue(String(alert.value));
    setFormInterval(alert.is_recurring ? String(alert.interval_minutes) : "0");
    setEditingId(alert.id);
    setShowForm(true);
  }

  function resetForm() {
    setFormType("krw");
    setFormCondition("gte");
    setFormValue("");
    setFormInterval("0");
    setEditingId(null);
    setShowForm(false);
  }

  async function handleSave() {
    if (!formValue) return alert("값을 입력해주세요.");
    
    const interval = parseInt(formInterval);
    const payload = {
      type: formType,
      condition_type: formCondition,
      value: parseFloat(formValue),
      is_recurring: interval > 0,
      interval_minutes: interval,
      enabled: true
    };

    console.log("[AlertPanel] Saving payload:", payload);

    if (editingId) {
      const { error } = await supabase.from("kimp_alerts").update(payload).eq("id", editingId);
      if (error) {
        console.error("[AlertPanel] Update error:", error);
        alert("수정 실패: " + error.message);
      }
    } else {
  const { error } = await supabase.from("kimp_alerts").insert([payload]);
      if (error) {
        console.error("[AlertPanel] Insert error:", error);
        alert("추가 실패: " + error.message);
      }
    }
    
    resetForm();
    fetchAlerts();
  }

  interface BtnGroupProps<T extends string> {
    value: T;
    options: { val: T; label: string }[];
    onChange: (val: T) => void;
  }

  const BtnGroup = <T extends string>({ value, options, onChange }: BtnGroupProps<T>) => (
    <div className="space-y-1.5">
      <div className="flex bg-muted/50 p-1 rounded-lg gap-1">
        {options.map((opt) => (
          <button
            key={opt.val}
            onClick={() => onChange(opt.val)}
            className={`flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-all ${
              value === opt.val 
                ? "bg-background text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div 
      className={`fixed top-[48px] left-0 right-0 max-w-md mx-auto bg-card/95 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] transition-all duration-300 origin-top overflow-hidden z-[100]
        ${isOpen ? "max-h-[85vh] opacity-100 border-b border-l border-r border-border rounded-b-2xl" : "max-h-0 opacity-0 pointer-events-none"}`}
    >
      <div className="p-4 max-h-[85vh] overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-primary" />
            <h3 className="font-semibold text-sm">김프 알림설정</h3>
          </div>
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="p-1 text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        {/* 폼 영역 */}
        {showForm ? (
          <div className="bg-muted/30 rounded-xl p-4 mb-5 border border-border/50 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="grid grid-cols-2 gap-3">
              <BtnGroup 
                value={formType} 
                onChange={setFormType}
                options={[{ val: "krw", label: "원(₩)" }, { val: "percent", label: "퍼센트(%)" }]}
              />
              <BtnGroup 
                value={formCondition} 
                onChange={setFormCondition}
                options={[{ val: "gte", label: "이상" }, { val: "lte", label: "이하" }]}
              />
            </div>
            
            <BtnGroup 
              value={formInterval} 
              onChange={setFormInterval}
              options={[
                { val: "0", label: "1회" }, 
                { val: "10", label: "10m" }, 
                { val: "60", label: "1h" }, 
                { val: "240", label: "4h" }
              ]}
            />

            <div className="flex gap-2 items-center bg-background border border-border rounded-lg px-3 py-2 focus-within:ring-2 ring-primary/20 transition-all">
              <input 
                type="number" step="0.1" 
                className="bg-transparent text-sm font-bold flex-1 focus:outline-none"
                value={formValue} onChange={e => setFormValue(e.target.value)}
              />
              <span className="text-xs font-bold text-muted-foreground">{formType === "krw" ? "원" : "%"}</span>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={resetForm} className="flex-1 py-2 text-sm bg-muted rounded-lg text-muted-foreground font-semibold hover:text-foreground transition-colors">취소</button>
              <button onClick={handleSave} className="flex-1 py-2 text-sm bg-primary text-primary-foreground rounded-lg font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity">
                <Check size={14} /> 저장하기
              </button>
            </div>
          </div>
        ) : (
          <button 
            onClick={(e) => { e.stopPropagation(); setShowForm(true); }}
            className="w-full py-3 mb-5 rounded-xl bg-primary/10 border border-primary/20 text-sm font-bold text-primary flex items-center justify-center gap-2 hover:bg-primary/20 transition-all"
          >
            <Plus size={16} /> 새 알림 추가
          </button>
        )}

        {/* 리스트 영역 */}
        <div className="space-y-2 pb-2">
          {loading ? (
            <div className="flex flex-col items-center py-10 gap-2">
              <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-[11px] text-muted-foreground">알림 목록 불러오는 중...</p>
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-10 bg-muted/20 rounded-xl border border-dashed border-border">
              <p className="text-[11px] text-muted-foreground">등록된 알림이 없습니다.</p>
            </div>
          ) : (
            alerts.map(alert => (
              <div key={alert.id} className="flex items-center justify-between p-3 rounded-xl bg-background border border-border/50 hover:border-primary/30 transition-colors shadow-sm" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-bold shrink-0">
                    <span className={alert.value >= 0 ? "text-sky-400" : "text-rose-400"}>
                      {alert.value > 0 ? `+${alert.value}` : alert.value}{alert.type === "percent" ? "%" : "원"}
                    </span>
                    <span className="text-xs text-foreground/80">{alert.condition_type === "gte" ? "이상" : "이하"}</span>
                  </div>
                  
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase whitespace-nowrap">
                    {alert.interval_minutes === 0 ? "1회성" : alert.interval_minutes >= 60 ? `${alert.interval_minutes/60}H 반복` : `${alert.interval_minutes}M 반복`}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button 
                    onClick={() => handleToggle(alert.id, alert.enabled)}
                    className={`w-9 h-5 rounded-full relative transition-all duration-300 ${alert.enabled ? "bg-emerald-500" : "bg-red-400/20"}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300 ${alert.enabled ? "left-4.5" : "left-0.5"}`} style={{ left: alert.enabled ? '1.125rem' : '0.125rem' }} />
                  </button>
                  <button onClick={() => openEditForm(alert)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => handleDelete(alert.id)} className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
