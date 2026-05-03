import requests
import json

URL = "https://pggmvczpkzgpcrehlhiu.supabase.co/rest/v1/kimp_alerts"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnZ212Y3pwa3pncGNyZWhsaGl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMzA1NTQsImV4cCI6MjA5MTkwNjU1NH0.OMEt-jZ_-2BXtOYlAN0lHcoD-oA97nmSVaqKUieKLKo"

headers = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Range": "0-999"
}

print("Checking ALL alerts in DB...")
r = requests.get(URL, headers=headers)
print(f"Status: {r.status_code}")
data = r.json()
print(f"Data found: {json.dumps(data, indent=2, ensure_ascii=False)}")
