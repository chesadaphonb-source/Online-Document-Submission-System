export function downloadCSV(data: any[], filename: string) {
  if (data.length === 0) return;

  // Get headers from first object
  const headers = Object.keys(data[0]);

  // Create CSV rows
  const csvRows = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        let value = row[header];
        if (value === null || value === undefined) {
          value = '';
        } else if (typeof value === 'object') {
          value = JSON.stringify(value);
        } else {
          value = String(value);
        }
        // Escape quotes and wrap in quotes if contains comma
        value = value.replace(/"/g, '""');
        return `"${value}"`;
      }).join(',')
    )
  ];

  const csvContent = csvRows.join('\n');
  
  // Add BOM (Byte Order Mark) for Excel to read UTF-8 properly
  const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
  
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export function formatMoney(val: string | number, keyOrLabel?: string): string {
  if (val === null || val === undefined) return '-';
  const strVal = String(val).trim();
  if (!strVal) return '-';

  // Check if key or label relates to money
  const cleanKey = (keyOrLabel || '').toLowerCase();
  const isMoney = 
    cleanKey.includes('fee') || 
    cleanKey.includes('amount') || 
    cleanKey.includes('money') || 
    cleanKey.includes('price') || 
    cleanKey.includes('payment') || 
    cleanKey.includes('ชำระ') || 
    cleanKey.includes('เงิน') || 
    cleanKey.includes('ค่าธรรมเนียม') || 
    cleanKey.includes('บาท') || 
    cleanKey.includes('ราคา') || 
    cleanKey.includes('ค่าปรับ') || 
    cleanKey.includes('ค่าบริการ');

  if (!isMoney) return strVal;

  const cleanedVal = strVal.replace(/,/g, '');
  const isNumeric = /^-?\d+(\.\d+)?$/.test(cleanedVal);
  if (isNumeric) {
    const num = parseFloat(cleanedVal);
    if (!isNaN(num)) {
      return num.toLocaleString('th-TH');
    }
  }
  return strVal;
}

