# Analizator wydatków

Statyczna strona analizująca eksport „Lista operacji" z mBanku (CSV). Plik jest przetwarzany tylko w przeglądarce.

## Analiza AI (opcjonalna, lokalna)

Strona łączy się z lokalną [Ollamą](https://ollama.com). Do modelu trafiają wyłącznie zagregowane dane (podgląd w „Co dokładnie zobaczy model?").

1. Zainstaluj Ollamę i pobierz model, np. `ollama pull qwen2.5:7b`.
2. Uruchom lokalnie `index.html` – zwykle działa od razu.
3. Jeśli otwierasz stronę z GitHub Pages, zezwól na jej adres (PowerShell, potem zrestartuj Ollamę):

   ```powershell
   setx OLLAMA_ORIGINS "https://skrzypekjan.github.io"
   ```
