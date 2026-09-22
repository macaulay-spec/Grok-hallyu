import React from 'react';
import { SettingsChoice, SettingsGroup } from '../../components/settings/Rows';
import { ScrollScreen, Screen } from '../../components/ui/Screen';
import { TopBar } from '../../components/ui/TopBar';
import { useApp } from '../../lib/hooks';

export default function LanguageSettings() {
  const { state, dispatch } = useApp();
  return (
    <Screen header={<TopBar mode="stack" title="Language" />}>
      <ScrollScreen>
        <SettingsGroup title="App language" footer="Drama titles always show the English title with the Korean original beneath. Korean interface text is arriving in stages.">
          <SettingsChoice value={state.prefs.language} onChange={(v) => dispatch({ type: 'prefs', patch: { language: v } })} options={[{ key: 'en', label: 'English' }, { key: 'ko', label: '한국어', detail: 'Partial — early access' }]} />
        </SettingsGroup>
      </ScrollScreen>
    </Screen>
  );
}
