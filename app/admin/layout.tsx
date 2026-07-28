export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav className="flex gap-4 border-b p-4 text-sm">
        <a href="/admin/lotes">Lotes</a>
        <a href="/admin/pagos">Pagos</a>
      </nav>
      <div className="p-6">{children}</div>
    </div>
  )
}
