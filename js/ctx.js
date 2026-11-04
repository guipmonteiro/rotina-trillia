// Estado de execução (não persistido): rota atual, feed carregado, última localização.

export const ctx = {
  route: 'hoje',
  sub: '',
  feed: null,
  feedError: '',
  feedLoading: false,
  lastLoc: null, // { lat, lng, acc, at, nearest: { office, dist, inside } }
  locError: '',
  banner: null, // { kind, text, action }
  render: () => {},
  ui: {
    month: null, // Date do mês exibido no histórico
    newsTopic: 'todos',
    newsQuery: '',
    newsSaved: false,
    normsFilter: 'todas',
    normsQuery: '',
    glossQuery: '',
    calc: null,
    focus: { running: false, mode: 'foco', endsAt: 0, remaining: 25 * 60, focusMin: 25, breakMin: 5, cycles: 0 },
  },
  installPrompt: null,
};
