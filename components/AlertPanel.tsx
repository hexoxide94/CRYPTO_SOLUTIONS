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
  const [formRecurring, setFormRecurring] = useState(false);
  const [formInterval, setFormInterval] = useState("5");

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
    setFormRecurring(alert.is_recurring);
    setFormInterval(String(alert.interval_minutes));
    setEditingId(alert.id);
    setShowForm(true);
  }

  function resetForm() {
    setFormType("krw");
    setFormCondition("gte");
    setFormValue("");
    setFormRecurring(false);
    setFormInterval("5");
    setEditingId(null);
    setShowForm(false);
  }

  async function handleSave() {
    if (!formValue) return alert("값을 입력해주세요.");
    
    const payload = {
      type: formType,
      condition_type: formCondition,
      value: parseFloat(formValue),
      is_recurring: formRecurring,
      interval_minutes: formRecurring ? parseInt(formInterval) || 5 : 5,
      enabled: true
    };

    if (editingId) {
      const { error } = await supabase.from("kimp_alerts").update(payload).eq("id", editingId);
      if (error) alert("수정 실패");
    } else {
      const { error } = await supabase.from("kimp_alerts").insert([payload]);
      if (error) alert("추가 실패");
    }
    
    resetForm();
    fetchAlerts();
  }

  return (
    <div 
      className={`fixed top-[48px] left-0 right-0 max-w-md mx-auto bg-card/95 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] transition-all duration-300 origin-top overflow-hidden z-[100]
        ${isOpen ? "max-h-[80vh] opacity-100 border-b border-l border-r border-border rounded-b-2xl" : "max-h-0 opacity-0 pointer-events-none"}`}
    >
      <div className="p-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-primary" />
            <h3 className="font-semibold text-sm">텔레그램 김프 알림</h3>
          </div>
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="p-1 text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        {/* 폼 영역 */}
        {showForm ? (
          <div className="bg-muted/50 rounded-lg p-3 mb-4 border border-border space-y-3 text-sm" onClick={e => e.stopPropagation()}>
            <div className="flex gap-2">
              <select className="bg-background border border-border rounded p-1.5 flex-1" value={formType} onChange={e => setFormType(e.target.value as "percent" | "krw")}>
                <option value="krw">원(₩) 기준</option>
                <option value="percent">퍼센트(%) 기준</option>
              </select>
              <select className="bg-background border border-border rounded p-1.5 flex-1" value={formCondition} onChange={e => setFormCondition(e.target.value as "gte" | "lte")}>
                <option value="gte">이상 (크거나 같을때)</option>
                <option value="lte">이하 (작거나 같을때)</option>
              </select>
            </div>
            
            <div className="flex gap-2 items-center">
              <input 
                type="number" step="0.1" 
                placeholder={formType === "krw" ? "예: 15.0 또는 -5.0" : "예: 1.5 또는 -0.5"}
                className="bg-background border border-border rounded p-1.5 flex-1 w-full"
                value={formValue} onChange={e => setFormValue(e.target.value)}
              />
              <span className="text-muted-foreground font-medium">{formType === "krw" ? "원" : "%"}</span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={formRecurring} onChange={e => setFormRecurring(e.target.checked)} className="rounded" />
                <span>반복 알림</span>
              </label>
              {formRecurring && (
                <div className="flex items-center gap-1 ml-auto">
                  <input type="number" min="1" className="bg-background border border-border rounded p-1 w-12 text-center" value={formInterval} onChange={e => setFormInterval(e.target.value)} />
                  <span className="text-muted-foreground">분마다</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t border-border/50">
              <button onClick={resetForm} className="flex-1 py-1.5 bg-muted rounded text-muted-foreground hover:text-foreground">취소</button>
              <button onClick={handleSave} className="flex-1 py-1.5 bg-primary text-primary-foreground rounded font-medium flex items-center justify-center gap-1">
                <Check size={14} /> 저장
              </button>
            </div>
          </div>
        ) : (
          <button 
            onClick={(e) => { e.stopPropagation(); setShowForm(true); }}
            className="w-full py-2 mb-4 rounded-lg bg-muted border border-border/50 text-sm font-medium text-foreground flex items-center justify-center gap-1.5 hover:bg-muted/80 transition-colors"
          >
            <Plus size={14} /> 새 알림 추가
          </button>
        )}

        {/* 리스트 영역 */}
        <div className="space-y-2">
          {loading ? (
            <p className="text-center text-xs text-muted-foreground py-4">불러오는 중...</p>
          ) : alerts.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-4">등록된 알림이 없습니다.</p>
          ) : (
            alerts.map(alert => (
              <div key={alert.id} className="flex items-center justify-between p-2.5 rounded-lg bg-background border border-border/50" onClick={e => e.stopPropagation()}>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <span className={alert.condition_type === "gte" ? "text-red-400" : "text-blue-400"}>
                      {alert.value > 0 ? `+${alert.value}` : alert.value}{alert.type === "percent" ? "%" : "원"}
                    </span>
                    <span>{alert.condition_type === "gte" ? "이상" : "이하"}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground flex gap-1.5">
                    <span className="bg-muted px-1.5 py-0.5 rounded">
                      {alert.is_recurring ? `${alert.interval_minutes}분 반복` : "1회성"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={() => handleToggle(alert.id, alert.enabled)}
                    className={`w-9 h-5 rounded-full relative transition-colors ${alert.enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${alert.enabled ? "left-4.5" : "left-0.5"}`} style={{ left: alert.enabled ? '1.125rem' : '0.125rem' }} />
                  </button>
                  <button onClick={() => openEditForm(alert)} className="p-1.5 text-muted-foreground hover:text-foreground">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => handleDelete(alert.id)} className="p-1.5 text-muted-foreground hover:text-red-400">
                    <Trash2 size={14} />
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
