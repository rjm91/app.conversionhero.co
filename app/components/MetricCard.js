export default function MetricCard({ label, value, color = 'text-blue-600', darkColor = '' }) {
  return (
    <div className="bg-white dark:bg-[#171B33] rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none p-5 hover:shadow-md dark:hover:brightness-110 transition-all">
      <p className={`text-xs font-bold uppercase tracking-wide mb-3 ${color} ${darkColor}`}>{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">{value}</p>
    </div>
  )
}
