import { NavoProvider } from "@/ui/state/NavoStore";
import { Stage } from "@/ui/stage/Stage";

export default function StagePage() {
  return (
    <NavoProvider>
      <Stage />
    </NavoProvider>
  );
}
