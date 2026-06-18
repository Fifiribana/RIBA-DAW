import React, { useState } from "react";
import "@/App.css";
import Daw from "@/components/Daw";
import { SplashScreen } from "@/components/daw/SplashScreen";

function App() {
  // Splash shows only on the very first boot of a tab session (skip during hot reloads).
  const [splashDone, setSplashDone] = useState(() => {
    try { return sessionStorage.getItem('riba-splash-seen') === '1'; }
    catch { return false; }
  });

  const finishSplash = () => {
    try { sessionStorage.setItem('riba-splash-seen', '1'); } catch { /* ignore */ }
    setSplashDone(true);
  };

  return (
    <div className="App">
      {!splashDone && <SplashScreen onDone={finishSplash} />}
      <Daw />
    </div>
  );
}

export default App;
