export interface CsvRow {
  target: string;
  text: string;
  file_url: string;
  schedule_time: string;
}

const headers = ["target", "text", "file_url", "schedule_time"] as const;

export function parseCsv(input: string): CsvRow[] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (char === '"') {
      if (inQuotes && input[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && input[i + 1] === "\n") {
        i += 1;
      }
      row.push(current);
      current = "";
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  if (rows.length === 0) {
    return [];
  }

  const headerRow = rows[0].map((value) => value.trim());
  const headerMap = headers.reduce<Record<string, number>>((acc, header) => {
    const index = headerRow.indexOf(header);
    acc[header] = index;
    return acc;
  }, {});

  return rows.slice(1).map((values) => {
    const getValue = (header: keyof CsvRow) => {
      const index = headerMap[header];
      return index >= 0 ? values[index]?.trim() ?? "" : "";
    };

    return {
      target: getValue("target"),
      text: getValue("text"),
      file_url: getValue("file_url"),
      schedule_time: getValue("schedule_time")
    };
  });
}

export function toCsv(rows: CsvRow[]): string {
  const lines = [headers.join(",")];
  for (const row of rows) {
    const values = headers.map((header) => stringifyValue(row[header]));
    lines.push(values.join(","));
  }
  return `${lines.join("\n")}\n`;
}

function stringifyValue(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes("\r") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
