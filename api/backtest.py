import pandas as pd
import json
from datetime import datetime, time, timedelta
from io import StringIO
from http.server import BaseHTTPRequestHandler
import cgi

def is_trading_time(dt):
    # Weekday check (0=Mon, 4=Fri, 5=Sat, 6=Sun)
    weekday = dt.weekday()
    t = dt.time()
    
    # 평일 A구간: 08:45 ~ 15:45
    if weekday < 5 and time(8, 45) <= t <= time(15, 45):
        return True
    
    # 평일 B구간: 18:00 ~ 23:59:59
    if weekday < 5 and t >= time(18, 0):
        return True
        
    # 익일 연장선: 00:00 ~ 06:00 (오늘이 화~토요일인 경우, 즉 전날이 월~금요일인 경우)
    if weekday <= 5 and t < time(6, 0):
        return True
        
    return False

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_type, pdict = cgi.parse_header(self.headers.get('content-type'))
        
        if content_type == 'multipart/form-data':
            pdict['boundary'] = bytes(pdict['boundary'], "utf-8")
            fields = cgi.parse_multipart(self.rfile, pdict)
            
            try:
                # Check if file was uploaded
                uploaded_file = fields.get('file')
                if uploaded_file and len(uploaded_file) > 0:
                    csv_file_data = uploaded_file[0].decode('utf-8')
                else:
                    # Use default file if no file uploaded
                    import os
                    default_path = os.path.join(os.path.dirname(__file__), 'kimp_history_01.csv')
                    with open(default_path, 'r', encoding='utf-8') as f:
                        csv_file_data = f.read()

                step = float(fields.get('step')[0])
                split = int(fields.get('split')[0])
                target = float(fields.get('target')[0])
                # Note: slippage is handled as a fixed 0.5 in the provided logic, 
                # but we'll use the slider value if it's not 0.5
                slippage = float(fields.get('slippage')[0]) 
                total_investment = float(fields.get('total_investment')[0])
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Invalid parameters: {str(e)}"}).encode())
                return
        else:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Content-Type must be multipart/form-data"}).encode())
            return

        try:
            df = pd.read_csv(StringIO(csv_file_data))
            required_cols = ['DATE', 'TIME', 'USDT', 'USD']
            if not all(col in df.columns for col in required_cols):
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"CSV must contain {required_cols}"}).encode())
                return
            
            df['timestamp'] = pd.to_datetime(df['DATE'] + ' ' + df['TIME'])
            df = df.sort_values('timestamp')
            df['USDT'] = pd.to_numeric(df['USDT'], errors='coerce')
            df['USD'] = pd.to_numeric(df['USD'], errors='coerce')
            
            # Fill missing USD values if any (simple forward fill)
            df['USD'] = df['USD'].ffill().bfill()
            df = df.dropna(subset=['USDT', 'USD'])
            
            # Pre-filter by trading time
            df['is_tradable'] = df['timestamp'].apply(is_trading_time)
            # We don't filter out yet because we need the full curve, but we only trade on is_tradable
        except Exception as e:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"Error parsing CSV: {str(e)}"}).encode())
            return

        # Simulation
        cash = total_investment
        positions = [] # List of {entry_corrected_kimp, entry_usd, amount_usdt, invested_krw, entry_time}
        trade_history = []
        equity_curve = []
        
        # Grid state
        grid_base = None
        invest_per_trade = total_investment / split
        
        last_curve_date = None
        
        for _, row in df.iterrows():
            ts = row['timestamp']
            usdt_price = row['USDT']
            usd_price = row['USD']
            current_kimp = usdt_price - usd_price
            
            # Grid Base Initialization
            if grid_base is None:
                grid_base = current_kimp

            # Record Equity Curve (Daily)
            current_date = ts.date()
            if last_curve_date != current_date:
                # Unrealized calculation: Cash + Sum(Positions)
                # Position value = invested_krw + (current_kimp - entry_kimp) * (invested_krw / entry_usd)
                unrealized_profit = 0
                for p in positions:
                    # Correction: (current_kimp - 0.5) if we were to sell now
                    current_exit_kimp = current_kimp - slippage
                    unrealized_profit += (current_exit_kimp - p['entry_corrected_kimp']) * (invest_per_trade / p['entry_usd'])
                
                equity_curve.append({
                    "time": ts.strftime('%Y-%m-%d'),
                    "balance": round(cash + (len(positions) * invest_per_trade) + unrealized_profit, 2)
                })
                last_curve_date = current_date

            # Trading Logic
            if not row['is_tradable']:
                continue
                
            # A. SELL CHECK
            exit_corrected_kimp = current_kimp - slippage
            to_remove = []
            for i, p in enumerate(positions):
                if exit_corrected_kimp >= p['entry_corrected_kimp'] + target:
                    # Profit calculation based on Gemini formula
                    profit = (exit_corrected_kimp - p['entry_corrected_kimp']) * (invest_per_trade / p['entry_usd'])
                    fee = invest_per_trade * 0.00006 # 0.006%
                    
                    cash += (invest_per_trade + profit - fee)
                    
                    trade_history.append({
                        "entry_time": p['entry_time'].strftime('%Y-%m-%d %H:%M'),
                        "exit_time": ts.strftime('%Y-%m-%d %H:%M'),
                        "buy_price_kimp": round(p['entry_corrected_kimp'], 2),
                        "sell_price_kimp": round(exit_corrected_kimp, 2),
                        "profit": round(profit - fee, 2),
                        "status": "closed"
                    })
                    to_remove.append(i)
            
            for i in sorted(to_remove, reverse=True):
                positions.pop(i)
                
            # B. BUY CHECK
            if len(positions) < split:
                entry_corrected_kimp = current_kimp + slippage
                
                can_buy = False
                if len(positions) == 0:
                    if entry_corrected_kimp <= grid_base:
                        can_buy = True
                else:
                    min_entry = min([p['entry_corrected_kimp'] for p in positions])
                    if entry_corrected_kimp <= min_entry - step:
                        can_buy = True
                
                if can_buy and cash >= invest_per_trade:
                    cash -= invest_per_trade
                    positions.append({
                        "entry_corrected_kimp": entry_corrected_kimp,
                        "entry_usd": usd_price,
                        "invested_krw": invest_per_trade,
                        "entry_time": ts
                    })
            
            # C. RANGE SHIFT
            if len(positions) == 0:
                if current_kimp > grid_base + (step * 2):
                    grid_base = current_kimp

        # Final Evaluation
        final_row = df.iloc[-1]
        final_kimp = final_row['USDT'] - final_row['USD']
        unrealized_profit = 0
        for p in positions:
            current_exit_kimp = final_kimp - slippage
            unrealized_profit += (current_exit_kimp - p['entry_corrected_kimp']) * (invest_per_trade / p['entry_usd'])
            
        final_balance = cash + (len(positions) * invest_per_trade) + unrealized_profit
        total_profit = final_balance - total_investment
        roi = (total_profit / total_investment) * 100
        
        equity_curve.append({
            "time": final_row['timestamp'].strftime('%Y-%m-%d %H:%M'),
            "balance": round(final_balance, 2)
        })

        result = {
            "summary": {
                "total_profit": round(total_profit, 2),
                "roi": round(roi, 2),
                "trade_count": len(trade_history) + len(positions),
                "completed_trades": len(trade_history),
                "active_trades_count": len(positions),
                "final_balance": round(final_balance, 2)
            },
            "equity_curve": equity_curve,
            "trades": trade_history[::-1][:200]
        }

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())
        return
