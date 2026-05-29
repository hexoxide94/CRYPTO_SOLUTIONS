export interface FuturesMonthInfo {
  currentSymbol: string;
  currentLabel: string;
  nextSymbol: string;
  nextLabel: string;
  defaultSymbol: string;
}

export function getKstParts() {
  const now = new Date();
  // Get time in KST (UTC+9)
  const kstTime = now.getTime() + 9 * 60 * 60 * 1000;
  const kstDate = new Date(kstTime);
  
  const year = kstDate.getUTCFullYear();
  const month = kstDate.getUTCMonth() + 1; // 1-indexed
  const date = kstDate.getUTCDate();
  const hours = kstDate.getUTCHours();
  const minutes = kstDate.getUTCMinutes();
  
  return { year, month, date, hours, minutes };
}

export function getThirdMondayKst(year: number, month: number): number {
  const tempDate = new Date(Date.UTC(year, month - 1, 1));
  const dayOfWeek = tempDate.getUTCDay();
  const firstMondayDate = 1 + (1 - dayOfWeek + 7) % 7;
  return firstMondayDate + 14;
}

export function getFuturesSymbol(year: number, month: number): string {
  const yearDigit = String(year % 10);
  const monthStr = String(month).padStart(2, "0");
  return `A75${yearDigit}${monthStr}`;
}

export function getFuturesMonths(): FuturesMonthInfo {
  const { year, month, date, hours, minutes } = getKstParts();
  
  // Get third Monday of the current month
  const thirdMonday = getThirdMondayKst(year, month);
  
  let isExpired = false;
  if (date > thirdMonday) {
    isExpired = true;
  } else if (date === thirdMonday) {
    // Expires at 11:30 AM KST
    if (hours > 11 || (hours === 11 && minutes >= 30)) {
      isExpired = true;
    }
  }
  
  let currentYear = year;
  let currentMonth = month;
  
  if (isExpired) {
    currentMonth += 1;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear += 1;
    }
  }
  
  let nextYear = currentYear;
  let nextMonth = currentMonth + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  
  const currentSymbol = getFuturesSymbol(currentYear, currentMonth);
  const nextSymbol = getFuturesSymbol(nextYear, nextMonth);
  
  return {
    currentSymbol,
    currentLabel: `${currentMonth}월물`,
    nextSymbol,
    nextLabel: `${nextMonth}월물`,
    defaultSymbol: currentSymbol
  };
}
