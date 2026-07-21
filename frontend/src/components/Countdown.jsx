import { useState, useEffect } from 'react';

export default function Countdown({ endsAt }) {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft(endsAt));

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(getTimeLeft(endsAt)), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!timeLeft) return <span className="text-xs font-medium text-red-500">Ended</span>;

  const { d, h, m, s } = timeLeft;
  const urgent = d === 0 && h === 0 && m < 10;

  return (
    <span className={`text-xs font-mono font-semibold ${urgent ? 'text-red-500' : 'text-gray-600'}`}>
      {d > 0 ? `${d}d ${h}h` : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
    </span>
  );
}

function getTimeLeft(endsAt) {
  const diff = new Date(endsAt) - new Date();
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { d, h, m, s };
}
