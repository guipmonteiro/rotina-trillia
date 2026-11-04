# Rotina Trillia

App pessoal (PWA, instalável no celular) para a rotina de trabalho na Trillia/B3:

- **Ponto com validação de presencial por GPS**: cadastre os escritórios (endereço ou "onde estou") com raio de presença; cada marcação registra se você estava dentro do raio.
- **Cota presencial configurável**: % dos dias úteis do mês, dias por semana ou dias por mês; feriados nacionais, de São Paulo e Carnaval descontados automaticamente; anel de progresso com quanto falta.
- **Modalidades personalizáveis**: presencial, remoto, externo e as que você criar (viagem, cliente, treinamento…), escolhendo quais contam como presencial.
- **Histórico e banco de horas**: calendário mensal com a letra de cada modalidade, saldo do mês e total, exportação CSV.
- **Configuração guiada** no primeiro uso (refazível em Ajustes → Jornada).
- **Lembretes diários**: arquivo de calendário (.ics) com alarmes recorrentes (funciona com o app fechado), notificações do app, aviso de pendência e link `#bater` para automações do iPhone (Atalhos → "Chegar" no escritório).
- **Mercado**: notícias de financiamento de veículos e imóveis, **monitor de normas** (Banco Central/CMN, DOU, Contran/Senatran/Detrans, Câmara, Senado, CVM/CNJ via imprensa), agenda regulatória e indicadores do Banco Central.
- **Trabalho**: tarefas (dá para criar a partir de uma notícia ou norma), notas com ditado e leitura em voz alta, foco (pomodoro), simulador Price/SAC, glossário do mercado e fontes oficiais.
- **Acessibilidade**: tamanho do texto até 200%, alto contraste, tema claro/escuro, fonte Atkinson Hyperlegible, espaçamento ampliado, botões maiores, redução de movimento, leitura em voz alta, VLibras, vibração e som de confirmação, compatível com VoiceOver/TalkBack e teclado. Auditado com axe-core (WCAG 2.1 AA) sem violações.

Os dados de ponto, localização, tarefas e notas ficam **apenas no aparelho** (sem servidor e sem login). Use **Ajustes → Dados → Exportar backup** periodicamente.

> Ferramenta pessoal de controle. Não substitui o sistema oficial de ponto da empresa.

## Publicar (GitHub Pages, gratuito)

1. Crie um repositório **público** no GitHub (ex.: `rotina-trillia`) e envie estes arquivos.
2. Em **Settings → Pages → Build and deployment → Source**, escolha **GitHub Actions**.
3. Em **Actions**, rode o workflow **"Atualizar notícias/normas e publicar"** (botão *Run workflow*).
4. O endereço fica `https://SEU-USUARIO.github.io/rotina-trillia/`.

Localização e notificações exigem HTTPS, que o GitHub Pages já fornece. (Repositório privado também funciona em planos pagos do GitHub ou publicando a pasta no Netlify/Cloudflare Pages.)

## Instalar no iPhone

Safari → abrir o endereço → **Compartilhar → Adicionar à Tela de Início** → abrir pelo ícone e permitir **Localização** e **Notificações**. Depois, em **Ajustes → Lembretes**, toque em **Adicionar ao calendário**.

## Robô de notícias e normas

`.github/workflows/feed.yml` roda `scripts/update_feed.py` 5 vezes por dia (06h10 a 18h10, horário de Brasília), atualiza `data/feed.json` e republica o site. Só usa a biblioteca padrão do Python.

Para mudar termos de busca, fontes ou indicadores, edite `config/monitor.json`. O campo `fontes` do feed mostra o status de cada fonte na última execução.

Teste local: `python3 scripts/update_feed.py --dry-run`

## Estrutura

```
index.html, css/app.css, js/*.js   app (HTML/CSS/JS sem build)
sw.js, manifest.webmanifest        funcionamento offline e instalação
data/feed.json                     notícias, normas e indicadores (gerado pelo robô)
config/monitor.json                termos e fontes monitorados
scripts/update_feed.py             robô de atualização
.github/workflows/feed.yml         agendamento + publicação no GitHub Pages
```

## Limitações conhecidas

- Um app web não consegue rodar em segundo plano: a validação de localização acontece quando você abre o app ou bate o ponto. Para aviso automático ao chegar/sair do escritório, use a automação do app Atalhos (instruções em Ajustes → Lembretes).
- O lembrete garantido com o app fechado vem do calendário (.ics). As notificações do app dependem de ele estar aberto ou em segundo plano recente.
- As fontes oficiais podem mudar o formato das páginas; se uma falhar, as demais continuam e o erro aparece em `fontes` no feed.
