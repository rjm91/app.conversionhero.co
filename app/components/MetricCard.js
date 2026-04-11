export default function MetricCard({ label, value, color = 'text-blue-600' }) {
  return (
    <div className="bg-white dark:bg-gray-800/80 rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-sm dark:shadow-none p-5 hover:shadow-md dark:hover:bg-gray-800 transition-all">
      <p className={`text-xs font-bold uppercase tracking-wide mb-3 ${color}`}>{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">{value}</p>
    </div>
  )
}
