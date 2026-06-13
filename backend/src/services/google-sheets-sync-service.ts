import { addDays, format } from "date-fns";

import { appConfig, type AppConfig } from "../config";
import {
  getGoogleSheetsClient,
  getGoogleSheetsSpreadsheetUrl,
  isGoogleSheetsSyncEnabled,
} from "../lib/google-sheets-client";
import type { BookingDetails } from "./booking-service";
import { getAllBookings, getBookingsForDateRange } from "./booking-service";

const RAW_SHEET_TITLE = "bookings_raw";
const VIEW_SHEET_TITLE = "schedule_view";
const META_SHEET_TITLE = "sync_meta";

const RAW_HEADERS = [
  "slot_key",
  "booking_id",
  "booking_code",
  "booking_date",
  "slot_time",
  "customer_name",
  "display_name",
  "customer_phone",
  "status",
  "created_at",
  "updated_at",
  "cancelled_at",
];

const META_HEADERS = ["key", "value", "updated_at"];

export type GoogleSheetsSyncResult = {
  synced: boolean;
  warning?: string;
};

type ManagedSheetInfo = {
  rawSheetId: number;
  viewSheetId: number;
  metaSheetId: number;
};

function buildSyncWarning(error: unknown) {
  const detail = error instanceof Error ? error.message : "неизвестная ошибка";
  return `Бронь сохранена, но Google таблица пока не обновилась: ${detail}`;
}

function buildSlotKey(bookingId: string, bookingDate: string, slotTime: string) {
  return `${bookingId}:${bookingDate}:${slotTime}`;
}

function toColumnLabel(columnNumber: number) {
  let result = "";
  let value = columnNumber;

  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }

  return result;
}

function buildDateRange(config: AppConfig) {
  const today = new Date();

  return Array.from({ length: config.GOOGLE_SHEETS_VIEW_DAYS }, (_, index) => {
    const date = addDays(today, index);

    return {
      value: format(date, "yyyy-MM-dd"),
      label: format(date, "EEE dd.MM"),
    };
  });
}

function buildRawRowsForBooking(booking: BookingDetails) {
  return booking.slotTimes.map((slotTime) => [
    buildSlotKey(booking.id, booking.bookingDate, slotTime),
    booking.id,
    booking.bookingCode,
    booking.bookingDate,
    slotTime,
    booking.customerName,
    booking.customerName,
    booking.customerPhone,
    booking.status,
    booking.createdAt,
    booking.updatedAt,
    booking.cancelledAt ?? "",
  ]);
}

async function ensureManagedSheets(config: AppConfig): Promise<ManagedSheetInfo> {
  const sheets = await getGoogleSheetsClient(config);
  const spreadsheetId = config.GOOGLE_SHEETS_SPREADSHEET_ID;
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title,hidden,gridProperties)",
  });

  const existingSheets = new Map(
    (spreadsheet.data.sheets ?? [])
      .map((sheet) => sheet.properties)
      .filter((properties): properties is NonNullable<typeof properties> => Boolean(properties))
      .map((properties) => [properties.title ?? "", properties])
  );

  const addRequests: NonNullable<
    Parameters<typeof sheets.spreadsheets.batchUpdate>[0]["requestBody"]
  >["requests"] = [];

  if (!existingSheets.has(RAW_SHEET_TITLE)) {
    addRequests.push({
      addSheet: {
        properties: {
          title: RAW_SHEET_TITLE,
          hidden: true,
          gridProperties: {
            rowCount: 2000,
            columnCount: RAW_HEADERS.length,
          },
        },
      },
    });
  }

  if (!existingSheets.has(VIEW_SHEET_TITLE)) {
    addRequests.push({
      addSheet: {
        properties: {
          title: VIEW_SHEET_TITLE,
          hidden: false,
          gridProperties: {
            rowCount: 64,
            columnCount: config.GOOGLE_SHEETS_VIEW_DAYS + 1,
            frozenRowCount: 1,
            frozenColumnCount: 1,
          },
        },
      },
    });
  }

  if (!existingSheets.has(META_SHEET_TITLE)) {
    addRequests.push({
      addSheet: {
        properties: {
          title: META_SHEET_TITLE,
          hidden: true,
          gridProperties: {
            rowCount: 64,
            columnCount: META_HEADERS.length,
          },
        },
      },
    });
  }

  if (addRequests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: addRequests,
      },
    });
  }

  const updatedSpreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title,hidden,gridProperties)",
  });

  const updatedSheets = new Map(
    (updatedSpreadsheet.data.sheets ?? [])
      .map((sheet) => sheet.properties)
      .filter((properties): properties is NonNullable<typeof properties> => Boolean(properties))
      .map((properties) => [properties.title ?? "", properties])
  );

  const rawSheetId = updatedSheets.get(RAW_SHEET_TITLE)?.sheetId;
  const viewSheetId = updatedSheets.get(VIEW_SHEET_TITLE)?.sheetId;
  const metaSheetId = updatedSheets.get(META_SHEET_TITLE)?.sheetId;

  if (
    typeof rawSheetId !== "number" ||
    typeof viewSheetId !== "number" ||
    typeof metaSheetId !== "number"
  ) {
    throw new Error("Не удалось подготовить служебные листы Google Sheets.");
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        {
          range: `${RAW_SHEET_TITLE}!A1:${toColumnLabel(RAW_HEADERS.length)}1`,
          values: [RAW_HEADERS],
        },
        {
          range: `${META_SHEET_TITLE}!A1:${toColumnLabel(META_HEADERS.length)}1`,
          values: [META_HEADERS],
        },
      ],
    },
  });

  return {
    rawSheetId,
    viewSheetId,
    metaSheetId,
  };
}

async function getRawSheetRowMap(config: AppConfig) {
  const sheets = await getGoogleSheetsClient(config);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.GOOGLE_SHEETS_SPREADSHEET_ID,
    range: `${RAW_SHEET_TITLE}!A2:A`,
  });

  const rows = response.data.values ?? [];
  const rowMap = new Map<string, number>();

  rows.forEach((row, index) => {
    const slotKey = row[0];

    if (slotKey) {
      rowMap.set(slotKey, index + 2);
    }
  });

  return rowMap;
}

async function upsertRawRowsForBooking(booking: BookingDetails, config: AppConfig) {
  const sheets = await getGoogleSheetsClient(config);
  const spreadsheetId = config.GOOGLE_SHEETS_SPREADSHEET_ID;
  const rowMap = await getRawSheetRowMap(config);
  const rows = buildRawRowsForBooking(booking);
  const updates: Array<{ range: string; values: string[][] }> = [];
  const appends: string[][] = [];

  for (const row of rows) {
    const slotKey = row[0];
    const rowIndex = rowMap.get(slotKey);

    if (rowIndex) {
      updates.push({
        range: `${RAW_SHEET_TITLE}!A${rowIndex}:${toColumnLabel(RAW_HEADERS.length)}${rowIndex}`,
        values: [row],
      });
    } else {
      appends.push(row);
    }
  }

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: updates,
      },
    });
  }

  if (appends.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${RAW_SHEET_TITLE}!A:${toColumnLabel(RAW_HEADERS.length)}`,
      valueInputOption: "RAW",
      requestBody: {
        values: appends,
      },
    });
  }
}

async function rewriteRawSheetFromDatabase(config: AppConfig) {
  const sheets = await getGoogleSheetsClient(config);
  const spreadsheetId = config.GOOGLE_SHEETS_SPREADSHEET_ID;
  const allBookings = await getAllBookings(true);
  const rawRows = allBookings.flatMap(buildRawRowsForBooking);

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${RAW_SHEET_TITLE}!A2:${toColumnLabel(RAW_HEADERS.length)}`,
  });

  if (rawRows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${RAW_SHEET_TITLE}!A2:${toColumnLabel(RAW_HEADERS.length)}${rawRows.length + 1}`,
      valueInputOption: "RAW",
      requestBody: {
        values: rawRows,
      },
    });
  }
}

async function updateMetaSheet(config: AppConfig, rows: Array<[string, string, string]>) {
  const sheets = await getGoogleSheetsClient(config);
  const spreadsheetId = config.GOOGLE_SHEETS_SPREADSHEET_ID;

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${META_SHEET_TITLE}!A2:C`,
  });

  if (rows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${META_SHEET_TITLE}!A2:C${rows.length + 1}`,
      valueInputOption: "RAW",
      requestBody: {
        values: rows,
      },
    });
  }
}

async function rebuildScheduleView(config: AppConfig, sheetInfo: ManagedSheetInfo) {
  const sheets = await getGoogleSheetsClient(config);
  const dates = buildDateRange(config);
  const startDate = dates[0]?.value ?? format(new Date(), "yyyy-MM-dd");
  const endDate = dates[dates.length - 1]?.value ?? startDate;
  const bookings = await getBookingsForDateRange(startDate, endDate, false);
  const activeSlotMap = new Map<string, string>();

  for (const booking of bookings) {
    for (const slotTime of booking.slotTimes) {
      activeSlotMap.set(`${booking.bookingDate}:${slotTime}`, booking.customerName);
    }
  }

  const allTimes = Array.from({ length: 16 }, (_, index) =>
    `${String(index + 8).padStart(2, "0")}:00`
  );
  const rows = [
    ["Время", ...dates.map((item) => item.label)],
    ...allTimes.map((slotTime) => [
      slotTime,
      ...dates.map((dateInfo) => activeSlotMap.get(`${dateInfo.value}:${slotTime}`) ?? "Свободно"),
    ]),
  ];
  const lastColumn = toColumnLabel(dates.length + 1);
  const lastRow = rows.length;

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.GOOGLE_SHEETS_SPREADSHEET_ID,
    range: `${VIEW_SHEET_TITLE}!A1:${lastColumn}${lastRow}`,
    valueInputOption: "RAW",
    requestBody: {
      values: rows,
    },
  });

  const requests: NonNullable<
    Parameters<typeof sheets.spreadsheets.batchUpdate>[0]["requestBody"]
  >["requests"] = [
    {
      updateSheetProperties: {
        properties: {
          sheetId: sheetInfo.viewSheetId,
          gridProperties: {
            rowCount: Math.max(64, rows.length + 4),
            columnCount: Math.max(config.GOOGLE_SHEETS_VIEW_DAYS + 2, dates.length + 2),
            frozenRowCount: 1,
            frozenColumnCount: 1,
          },
        },
        fields:
          "gridProperties.rowCount,gridProperties.columnCount,gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
      },
    },
    {
      repeatCell: {
        range: {
          sheetId: sheetInfo.viewSheetId,
          startRowIndex: 0,
          endRowIndex: rows.length,
          startColumnIndex: 0,
          endColumnIndex: dates.length + 1,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 1, green: 1, blue: 1 },
            horizontalAlignment: "CENTER",
            verticalAlignment: "MIDDLE",
            wrapStrategy: "WRAP",
            textFormat: {
              fontSize: 10,
              foregroundColor: { red: 0.27, green: 0.16, blue: 0.24 },
            },
          },
        },
        fields:
          "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)",
      },
    },
    {
      repeatCell: {
        range: {
          sheetId: sheetInfo.viewSheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: dates.length + 1,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.99, green: 0.89, blue: 0.95 },
            textFormat: {
              bold: true,
              fontSize: 10,
              foregroundColor: { red: 0.45, green: 0.16, blue: 0.35 },
            },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    },
    {
      repeatCell: {
        range: {
          sheetId: sheetInfo.viewSheetId,
          startRowIndex: 1,
          endRowIndex: rows.length,
          startColumnIndex: 0,
          endColumnIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.99, green: 0.95, blue: 0.98 },
            textFormat: {
              bold: true,
              foregroundColor: { red: 0.45, green: 0.16, blue: 0.35 },
            },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetInfo.viewSheetId,
          dimension: "COLUMNS",
          startIndex: 0,
          endIndex: 1,
        },
        properties: {
          pixelSize: 84,
        },
        fields: "pixelSize",
      },
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetInfo.viewSheetId,
          dimension: "COLUMNS",
          startIndex: 1,
          endIndex: dates.length + 1,
        },
        properties: {
          pixelSize: 120,
        },
        fields: "pixelSize",
      },
    },
  ];

  allTimes.forEach((slotTime, rowIndex) => {
    dates.forEach((dateInfo, dateIndex) => {
      if (activeSlotMap.has(`${dateInfo.value}:${slotTime}`)) {
        requests.push({
          repeatCell: {
            range: {
              sheetId: sheetInfo.viewSheetId,
              startRowIndex: rowIndex + 1,
              endRowIndex: rowIndex + 2,
              startColumnIndex: dateIndex + 1,
              endColumnIndex: dateIndex + 2,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 1, green: 0.83, blue: 0.9 },
                textFormat: {
                  bold: true,
                  foregroundColor: { red: 0.45, green: 0.16, blue: 0.35 },
                },
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat)",
          },
        });
      }
    });
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: config.GOOGLE_SHEETS_SPREADSHEET_ID,
    requestBody: {
      requests,
    },
  });
}

async function syncInternal(
  config: AppConfig,
  action: "booking_change" | "full_rebuild",
  booking?: BookingDetails
) {
  const sheetInfo = await ensureManagedSheets(config);

  if (action === "full_rebuild") {
    await rewriteRawSheetFromDatabase(config);
  } else if (booking) {
    await upsertRawRowsForBooking(booking, config);
  }

  await rebuildScheduleView(config, sheetInfo);

  const timestamp = new Date().toISOString();

  await updateMetaSheet(config, [
    ["last_action", action, timestamp],
    ["last_synced_at", timestamp, timestamp],
    ["public_url", getGoogleSheetsSpreadsheetUrl(config), timestamp],
  ]);
}

export async function syncBookingToGoogleSheets(
  booking: BookingDetails,
  config: AppConfig = appConfig
): Promise<GoogleSheetsSyncResult> {
  if (!isGoogleSheetsSyncEnabled(config)) {
    return { synced: false };
  }

  try {
    await syncInternal(config, "booking_change", booking);
    return { synced: true };
  } catch (error) {
    console.error("Google Sheets booking sync failed:", error);
    return {
      synced: false,
      warning: buildSyncWarning(error),
    };
  }
}

export async function syncCancelledBookingToGoogleSheets(
  booking: BookingDetails,
  config: AppConfig = appConfig
): Promise<GoogleSheetsSyncResult> {
  if (!isGoogleSheetsSyncEnabled(config)) {
    return { synced: false };
  }

  try {
    await syncInternal(config, "booking_change", booking);
    return { synced: true };
  } catch (error) {
    console.error("Google Sheets cancellation sync failed:", error);
    return {
      synced: false,
      warning: buildSyncWarning(error),
    };
  }
}

export async function rebuildGoogleSheetsFromDatabase(
  config: AppConfig = appConfig
): Promise<GoogleSheetsSyncResult> {
  if (!isGoogleSheetsSyncEnabled(config)) {
    return {
      synced: false,
      warning: "Синхронизация Google Sheets выключена в конфиге.",
    };
  }

  try {
    await syncInternal(config, "full_rebuild");
    return { synced: true };
  } catch (error) {
    console.error("Google Sheets rebuild failed:", error);
    return {
      synced: false,
      warning: buildSyncWarning(error),
    };
  }
}
