export default function MetricCard({ label, value, color = 'text-blue-600' }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
      <p className={`text-xs font-bold uppercase tracking-wide mb-3 ${color}`}>{label}</p>
      <p className="text-2xl font-bold text-gray-900 tracking-tight">{value}</p>
    </div>
  )
}
