import { addDays, format } from "date-fns";
import { ru } from "date-fns/locale";
import { useEffect, useMemo, useState } from "react";

import "./App.css";
import { createBooking, getAppConfig, getSlotsByDate } from "./lib/api";
import {
  closeMiniApp,
  initTelegramWebApp,
  openExternalLink,
  showTelegramAlert,
} from "./lib/telegram";
import type { AppConfig, Slot } from "./types";

type DateOption = {
  value: string;
  label: string;
  weekday: string;
  isToday: boolean;
};

function App() {
  const dateOptions = useMemo<DateOption[]>(
    () =>
      Array.from({ length: 30 }, (_, index) => {
        const date = addDays(new Date(), index);

        return {
          value: format(date, "yyyy-MM-dd"),
          label: format(date, "dd.MM"),
          weekday: index === 0 ? "Сегодня" : format(date, "EEE", { locale: ru }),
          isToday: index === 0,
        };
      }),
    []
  );
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [selectedDate, setSelectedDate] = useState(dateOptions[0]?.value ?? "");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedTimes, setSelectedTimes] = useState<string[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  useEffect(() => {
    initTelegramWebApp();

    getAppConfig()
      .then(setConfig)
      .catch((requestError) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Не удалось загрузить настройки приложения."
        );
      });
  }, []);

  useEffect(() => {
    if (!selectedDate) {
      return;
    }

    setLoadingSlots(true);
    setError("");
    setSelectedTimes([]);

    getSlotsByDate(selectedDate)
      .then(setSlots)
      .catch((requestError) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Не удалось загрузить расписание."
        );
      })
      .finally(() => setLoadingSlots(false));
  }, [selectedDate]);

  const selectedDateLabel =
    dateOptions.find((item) => item.value === selectedDate)?.label ?? selectedDate;

  function toggleSlot(slot: Slot) {
    if (!slot.available) {
      return;
    }

    setSelectedTimes((current) =>
      current.includes(slot.time)
        ? current.filter((time) => time !== slot.time)
        : [...current, slot.time].sort()
    );
  }

  async function handleConfirmBooking() {
    if (!customerName.trim()) {
      setError("Введите имя.");
      return;
    }

    if (!customerPhone.trim()) {
      setError("Введите телефон.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");

      const result = await createBooking({
        bookingDate: selectedDate,
        slotTimes: selectedTimes,
        customerName,
        customerPhone,
      });

      const syncWarning = result.syncWarning;
      const successMessage = syncWarning
        ? `Данные переданы боту. Подтверждение отправлено в чат. ${syncWarning}`
        : "Данные переданы боту. Подтверждение уже отправлено в чат.";

      setInfoMessage(successMessage);
      await showTelegramAlert(successMessage);
      closeMiniApp();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось создать бронь. Попробуйте еще раз."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Dariga Booking</p>
        <h1>Бронирование студии</h1>
        <p className="hero-text">
          Сначала можно открыть таблицу и посмотреть расписание, а затем вернуться сюда и
          забронировать свободные часы.
        </p>
        <button
          type="button"
          className="secondary-button"
          onClick={() => openExternalLink(config?.googleSheetsUrl ?? "https://example.com")}
        >
          Посмотреть в Google таблице
        </button>
      </section>

      <section className="card">
        <div className="section-header">
          <div>
            <p className="section-kicker">Шаг 1</p>
            <h2>Выберите дату</h2>
          </div>
          <span className="pill">30 дней вперед</span>
        </div>

        <div className="date-list">
          {dateOptions.map((dateOption) => (
            <button
              key={dateOption.value}
              type="button"
              className={`date-chip ${selectedDate === dateOption.value ? "active" : ""}`}
              onClick={() => setSelectedDate(dateOption.value)}
            >
              <span>{dateOption.weekday}</span>
              <strong>{dateOption.label}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-header">
          <div>
            <p className="section-kicker">Шаг 2</p>
            <h2>Выберите часы</h2>
          </div>
          <span className="pill">{selectedDateLabel}</span>
        </div>

        {loadingSlots ? <p className="muted">Загружаю доступные слоты...</p> : null}

        <div className="slots-grid" aria-live="polite">
          {slots.length > 0 ? (
            slots.map((slot) => {
              const selected = selectedTimes.includes(slot.time);

              return (
                <button
                  key={slot.time}
                  type="button"
                  className={`slot-button ${selected ? "selected" : ""} ${
                    slot.available ? "" : "disabled"
                  }`}
                  onClick={() => toggleSlot(slot)}
                  disabled={!slot.available}
                >
                  {slot.time}
                </button>
              );
            })
          ) : (
            <p className="slots-empty">На выбранную дату пока нет доступных слотов.</p>
          )}
        </div>

        <div className="summary-box">
          <div>
            <p className="summary-label">Дата</p>
            <strong>{selectedDateLabel}</strong>
          </div>
          <div>
            <p className="summary-label">Время</p>
            <strong>{selectedTimes.length > 0 ? selectedTimes.join(", ") : "Пока не выбрано"}</strong>
          </div>
        </div>

        <button
          type="button"
          className="primary-button"
          disabled={selectedTimes.length === 0}
          onClick={() => {
            setError("");
            setShowConfirmModal(true);
          }}
        >
          Забронировать
        </button>
      </section>

      {error ? <p className="status error">{error}</p> : null}
      {infoMessage ? <p className="status success">{infoMessage}</p> : null}

      {showConfirmModal ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="section-header">
              <div>
                <p className="section-kicker">Шаг 3</p>
                <h2 id="modal-title">Подтверждение</h2>
              </div>
            </div>

            <div className="confirmation-box">
              <p>Дата: {selectedDateLabel}</p>
              <p>Время: {selectedTimes.join(", ")}</p>
            </div>

            <label className="field">
              <span>Имя</span>
              <input
                type="text"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Введите имя"
              />
            </label>

            <label className="field">
              <span>Телефон</span>
              <input
                type="tel"
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                placeholder="+7 777 123 45 67"
              />
            </label>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowConfirmModal(false)}
                disabled={submitting}
              >
                Закрыть
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleConfirmBooking}
                disabled={submitting}
              >
                {submitting ? "Отправка..." : "Подтвердить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
