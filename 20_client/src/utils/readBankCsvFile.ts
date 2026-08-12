/** Read bank CSV exports that may be UTF-8 or EUC-KR / Shift_JIS. */
export async function readBankCsvFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    throw new Error("EXCEL_NOT_CSV");
  }

  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buf);
  if (/거래일|입금|출금|적요|잔액|日付|摘要|残高|預入|引出/.test(utf8)) {
    return utf8;
  }

  for (const encoding of ["euc-kr", "shift_jis", "windows-949"] as const) {
    try {
      const decoded = new TextDecoder(encoding).decode(buf);
      if (/거래일|입금|출금|적요|잔액|日付|摘要|残高|預入|引出/.test(decoded)) {
        return decoded;
      }
    } catch {
      // try next encoding
    }
  }

  return utf8;
}
