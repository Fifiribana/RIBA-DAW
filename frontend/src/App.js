import React, { useState } from "react";
import "@/App.css";
import Daw from "@/components/Daw";
import { SplashScreen } from "@/components/daw/SplashScreen";

function _detectCinematic() {
  try {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('cinematic') === '1' || qs.get('cinematic') === 'true') return true;
    if (localStorage.getItem('riba-cinematic-boot') === '1') return true;
  } catch { /* SSR / private mode */ }
  return false;
}

function App() {
  const [cinematic] = useState(_detectCinematic);

  // Splash shows only on the very first boot of a tab session (skip during hot reloads).
  // EXCEPT in cinematic mode, where we replay it on every reload (intro = trailer).
  const [splashDone, setSplashDone] = useState(() => {
    if (cinematic) return false;
    try { return sessionStorage.getItem('riba-splash-seen') === '1'; }
    catch { return false; }
  });

  const finishSplash = () => {
    try { sessionStorage.setItem('riba-splash-seen', '1'); } catch { /* ignore */ }
    setSplashDone(true);
  };

  return (
    <div className="App">
      {!splashDone && (
        <SplashScreen
          onDone={finishSplash}
          mode={cinematic ? 'cinematic' : 'short'}
        />
      )}
      <Daw />
    </div>
  );
}

export default App;
