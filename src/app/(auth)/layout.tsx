export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left side - Branding */}
      <div className="hidden lg:flex flex-col justify-between bg-muted p-10">
        <div className="flex items-center gap-2 text-lg font-medium">
          <div className="h-8 w-8 rounded-lg bg-primary" />
          <span>Bunrift</span>
        </div>
        <blockquote className="space-y-2">
          <p className="text-lg">
            "La simplicité est la sophistication suprême."
          </p>
          <footer className="text-sm text-muted-foreground">
            Leonardo da Vinci
          </footer>
        </blockquote>
      </div>

      {/* Right side - Form */}
      <div className="flex items-center justify-center p-8">{children}</div>
    </div>
  );
}
