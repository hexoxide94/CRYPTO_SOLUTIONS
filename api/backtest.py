import pandas as pd
import json
from datetime import datetime, time
from io import StringIO
from http.server import BaseHTTPRequestHandler
import cgi

def is_trading_time(dt):
    # Weekday check (0=Mon, 4=Fri)
    if dt.weekday() >= 5:
        return False
    
    t = dt.time()
    # 08:45 ~ 15:45
    if time(8, 45) <= t <= time(15, 45):
        return True
    # 18:00 ~ 06:00 (Next day)
    if t >= time(18, 0) or t < time(6, 0):
        return True
        
    return False

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_type, pdict = cgi.parse_header(self.headers.get('content-type'))
        
        # Parse multipart form data
        if content_type == 'multipart/form-data':
            # cgi.parse_multipart is tricky with binary in some environments
            # but since Vercel provides the body, we can handle it
            pdict['boundary'] = bytes(pdict['boundary'], "utf-8")
            fields = cgi.parse_multipart(self.rfile, pdict)
            
            try:
                csv_file_data = fields.get('file')[0].decode('utf-8')
                step = float(fields.get('step')[0])
                split = int(fields.get('split')[0])
                target = float(fields.get('target')[0])
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

        # Load CSV
        try:
            df = pd.read_csv(StringIO(csv_file_data))
            # Ensure columns exist
            required_cols = ['DATE', 'TIME', 'USDT']
            if not all(col in df.columns for col in required_cols):
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"CSV must contain {required_cols}"}).encode())
                return
            
            # Combine DATE and TIME
            df['timestamp'] = pd.to_datetime(df['DATE'] + ' ' + df['TIME'])
            df = df.sort_values('timestamp')
            df['USDT'] = pd.to_numeric(df['USDT'], errors='coerce')
            df = df.dropna(subset=['USDT'])
        except Exception as e:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"Error parsing CSV: {str(e)}"}).encode())
            return

        # Simulation
        cash = total_investment
        active_trades = []
        trade_history = []
        equity_curve = []
        
        # Pre-filter trading time to speed up
        # df = df[df['timestamp'].apply(is_trading_time)] # Not quite right because we need the full timeline for the curve
        
        last_processed_date = None
        
        for _, row in df.iterrows():
            ts = row['timestamp']
            price = row['USDT']
            
            # Record equity curve (daily or every N points to keep JSON small)
            current_date = ts.date()
            if last_processed_date != current_date:
                unrealized_val = sum([t['amount'] * price for t in active_trades])
                equity_curve.append({
                    "time": ts.strftime('%Y-%m-%d'),
                    "balance": round(cash + unrealized_val, 2)
                })
                last_processed_date = current_date

            if not is_trading_time(ts):
                continue
            
            # Check Exit
            exit_price = price - slippage
            to_remove = []
            for i, trade in enumerate(active_trades):
                if exit_price >= trade['target_price']:
                    proceeds = trade['amount'] * exit_price
                    fee = proceeds * 0.0003
                    cash += (proceeds - fee)
                    
                    trade_history.append({
                        "entry_time": trade['entry_time'].strftime('%Y-%m-%d %H:%M'),
                        "exit_time": ts.strftime('%Y-%m-%d %H:%M'),
                        "buy_price": trade['buy_price'],
                        "sell_price": exit_price,
                        "profit": round(proceeds - trade['invested_krw'] - trade['entry_fee'] - fee, 2),
                        "status": "closed"
                    })
                    to_remove.append(i)
            
            for i in sorted(to_remove, reverse=True):
                active_trades.pop(i)
            
            # Check Entry
            if len(active_trades) < split:
                # Determine last entry price
                last_entry_price = active_trades[-1]['buy_price'] if active_trades else float('inf')
                
                # If first trade or price dropped enough from last entry
                entry_price = price + slippage
                if len(active_trades) == 0 or entry_price <= last_entry_price - step:
                    invest_per_trade = total_investment / split
                    if cash >= invest_per_trade:
                        entry_fee = invest_per_trade * 0.0003
                        invested_krw = invest_per_trade
                        cash -= (invested_krw + entry_fee)
                        
                        amount = invested_krw / entry_price
                        target_price = entry_price + target
                        
                        active_trades.append({
                            "entry_time": ts,
                            "buy_price": entry_price,
                            "amount": amount,
                            "target_price": target_price,
                            "invested_krw": invested_krw,
                            "entry_fee": entry_fee
                        })

        # Final Summary
        final_price = df.iloc[-1]['USDT']
        unrealized_val = sum([t['amount'] * final_price for t in active_trades])
        final_balance = cash + unrealized_val
        total_profit = final_balance - total_investment
        roi = (total_profit / total_investment) * 100
        
        # Add final equity point
        equity_curve.append({
            "time": df.iloc[-1]['timestamp'].strftime('%Y-%m-%d %H:%M'),
            "balance": round(final_balance, 2)
        })

        result = {
            "summary": {
                "total_profit": round(total_profit, 2),
                "roi": round(roi, 2),
                "trade_count": len(trade_history) + len(active_trades),
                "completed_trades": len(trade_history),
                "active_trades_count": len(active_trades),
                "final_balance": round(final_balance, 2)
            },
            "equity_curve": equity_curve,
            "trades": trade_history[::-1][:200] # Return last 200 trades for performance
        }

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())
        return
