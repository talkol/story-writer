import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AchievementsScreen from './screens/AchievementsScreen';
import ActionsScreen from './screens/ActionsScreen';
import GenreScreen from './screens/GenreScreen';
import LibraryScreen from './screens/LibraryScreen';
import ReadScreen from './screens/ReadScreen';
import SettingsScreen from './screens/SettingsScreen';
import { loadSettings } from './storage/settings';

export default function App() {
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
        <Route path="/story/:id/achievements" element={<AchievementsScreen />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Routes>
    </div>
  );
}
