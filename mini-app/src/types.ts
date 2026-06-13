export type Slot = {
  time: string;
  available: boolean;
};

export type Booking = {
  id: string;
  bookingCode: string;
  bookingDate: string;
  slotTimes: string[];
  customerName: string;
  customerPhone: string;
  status: string;
};

export type CreateBookingResult = {
  booking: Booking;
  syncWarning?: string;
};

export type AppConfig = {
  studioName: string;
  googleSheetsUrl: string;
  slotStartHour: string;
  slotEndHour: string;
};
