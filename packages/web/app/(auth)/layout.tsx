import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background">
      <Image
        src="/logo.svg"
        alt="Loyola"
        width={200}
        height={48}
        priority
        className="brightness-0 invert"
      />
      {children}
    </div>
  );
}
