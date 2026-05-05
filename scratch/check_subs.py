import os
from supabase import create_client

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not url or not key:
    # Read from .env.local
    with open(".env.local", "r") as f:
        for line in f:
            if line.startswith("NEXT_PUBLIC_SUPABASE_URL="):
                url = line.split("=", 1)[1].strip().strip('"')
            elif line.startswith("NEXT_PUBLIC_SUPABASE_ANON_KEY="):
                key = line.split("=", 1)[1].strip().strip('"')

client = create_client(url, key)
response = client.table("push_subscriptions").select("*").execute()
print(f"Found {len(response.data)} subscriptions.")
if len(response.data) > 0:
    print(response.data)
