import sys

path = r'c:\Users\hexox\Desktop\aladin\CRYPTO_SOLUTIONS\app\(pages)\kimp\page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Restore the missing section with updated values
search_text = '  const [listExpanded, setListExpanded]   = useState(true);\n\n\n     const onUp = ()'
# The failed edits might have left multiple newlines or broken code.
# Let's find where listExpanded is and fix from there.

start_marker = '  const [listExpanded, setListExpanded]   = useState(true);'
end_marker = '    const onUp = () => {'

replacement = """  const [listExpanded, setListExpanded]   = useState(true);
  const [chartHeight, setChartHeight]     = useState(320);
  const [isResizing, setIsResizing]       = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const { usdt: usdtPrices }             = useUsdtPrices();

  // ── 차트 높이 조절 ──────────────────────────────────────────
  const startResizing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsResizing(true);
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    startYRef.current = clientY;
    startHeightRef.current = chartHeight;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    if (!isResizing) return;

    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientY = "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      const deltaY = clientY - startYRef.current;
      const newHeight = Math.min(Math.max(140, startHeightRef.current + deltaY), 450);
      setChartHeight(newHeight);
    };

    const onUp = () => {"""

import re
# We'll use a more flexible regex to find the broken part
pattern = re.escape(start_marker) + r'[\s\n]*' + re.escape(end_marker)
new_content = re.sub(pattern, replacement, content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Patch applied successfully")
