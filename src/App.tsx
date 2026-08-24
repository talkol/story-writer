import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ActionsScreen from './screens/ActionsScreen';
import GenreScreen from './screens/GenreScreen';
import LibraryScreen from './screens/LibraryScreen';
import ReadScreen from './screens/ReadScreen';
import SettingsScreen from './screens/SettingsScreen';
import { startCoverReconciler } from './ai/coverReconciler';
import { loadSettings } from './storage/settings';

export default function App() {
  // Covers heal in the background for as long as the app is open, independent of
  // which screen is mounted.
  useEffect(() => {
    startCoverReconciler();
  }, []);

  // Reader font size is a CSS variable so pagination can react to it by re-measuring.
  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', String(loadSettings().fontScale));
  }, []);

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route path="/library" element={<LibraryScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        {/* No :id — creation mode. */}
        <Route path="/new" element={<GenreScreen />} />
        <Route path="/story/:id/genre" element={<GenreScreen />} />
        <Route path="/story/:id/read" element={<ReadScreen />} />
        <Route path="/story/:id/actions" element={<ActionsScreen />} />
        {/* Renders the reader with the achievements sheet over it: the book stays
            visible behind, and the back gesture closes the sheet. */}
        <Route path="/story/:id/achievements" element={<ReadScreen showAchievements />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Routes>
    </div>
  );
}
