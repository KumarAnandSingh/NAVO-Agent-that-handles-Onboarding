import { NavoFace } from "@/ui/components/NavoFace";

export default function HomePage() {
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <NavoFace state="brand" size={128} />
    </main>
  );
}
