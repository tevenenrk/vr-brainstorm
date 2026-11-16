# Stół Artyleryjski VR (Meta Quest 3 / 3S)

Symulator WebXR: przed Tobą lewituje prostokątna platforma, a na niej miniaturowy kawałek
świata 1 km × 4 km (skala 1:2000, czyli 0,5 m × 2 m). Są tam pagórki, lasy, rzeka z trzema
mostami, jezioro, stawy i pola. Przy bliższej krawędzi stoją Twoje działa, a **za nimi
Twoja wioska**. Z dalekiego końca nadciągają fale żołnierzy. Maszerują do mostów, a po
przejściu rzeki palą domy we wiosce. Gra kończy się, gdy spłonie cała wioska.

Nie trzeba niczego budować ani instalować. To czysty HTML i JavaScript (Three.js jest
dołączony w `vendor/`), który działa w przeglądarce Meta Quest.

## Sterowanie (Quest)

| Przycisk | Akcja |
|---|---|
| **Promień z kontrolera** | celowanie w teren na stole |
| **Spust** | salwa ze wszystkich gotowych dział |
| **Spust 2× szybko** | ogień ciągły: każde działo strzela, gdy tylko się załaduje (kolejny spust = stop) |
| **Prawa gałka ↑/↓** | kąt lufy 15°–85° (im wyżej, tym bardziej pocisk spada z góry) |
| **Klik prawej gałki** | zablokuj / odblokuj cel w miejscu |
| **Trzymaj A i przesuń promień** | wyznacz prostokątny obszar ostrzału (pociski spadają losowo w obszarze) |
| **A krótko** | usuń obszar |
| **B** | menu opcji (klikasz promieniem i spustem) |
| **Grip, jedna ręka** | chwyć platformę: przesuwanie i obrót |
| **Grip, obie ręce** | skalowanie (0,15× – 25×), obrót i przesuwanie |
| **Lewa gałka** | obrót platformy (←/→) i zoom (↑/↓) wokół punktu, w który celujesz |
| **X** | ustaw platformę przed sobą |
| **Y** | nowa gra |

Na lewym kontrolerze jest panel z falą, liczbą trafień, stanem wioski, kątem lufy,
paskami ładowania każdego działa i odległością/czasem lotu do celu. Menu pojawia się
w tym samym miejscu.

### Opcje (menu)
- **liczba dział:** 1–8;
- **czas ładowania:** każde działo ma swój, ±15% od wartości z menu;
- **kąt lufy;**
- **szybkość pocisków:** 25%–300%;
- **trudność.**

Ustawienia są zapamiętywane w przeglądarce.

### Balistyka
Kąt lufy ustawiasz sam, a gra dobiera ładunek (prędkość wylotową), żeby trafić w cel.
Kolory toru:
- **zielony:** pocisk spadnie tam, gdzie celujesz;
- **pomarańczowy:** tor zasłania wzgórze (zwiększ kąt);
- **czerwony:** cel poza zasięgiem przy tym kącie (zmniejsz kąt).

### Zniszczenia
- Każdy pocisk zostawia **lej** (wgłębienie z wałem ziemi) i osmalony teren.
- Pociski palą drzewa i burzą domy, także Twoje, więc uważaj przy ostrzale wioski.
- 3 trafienia w most go niszczą. Wróg szuka wtedy innego mostu, a gdy żadnego nie ma,
  przechodzi rzekę w bród (wolno).

Tryby:
- **Wejdź w VR:** wirtualny pokój.
- **Mixed Reality:** passthrough, czyli platforma unosi się w Twoim prawdziwym pokoju.

## Podgląd na komputerze

- klik / `Spacja`: salwa;
- 2× klik: ogień ciągły (`C` przełącza);
- `Shift` + przeciągnięcie: obszar ostrzału;
- `L`: zablokuj cel (`Esc` odblokowuje);
- `W` / `S`: kąt lufy;
- `O`: opcje;
- `N`: nowa gra;
- przeciąganie: obrót kamery, kółko: zoom.

## Jak uruchomić na Queście

WebXR wymaga **HTTPS**. Masz dwie możliwości.

### A) GitHub Pages (najprościej)
1. Na GitHubie wejdź w repozytorium, potem *Settings → Pages*.
2. W polu *Source* wybierz *Deploy from a branch*, wskaż gałąź z tym kodem i folder `/ (root)`.
   W aplikacji GitHub na Androidzie tej opcji nie ma, więc zrób to na github.com w przeglądarce.
3. Po chwili strona będzie pod adresem `https://<użytkownik>.github.io/vr-brainstorm/`.
4. Otwórz ten adres w przeglądarce na Queście i kliknij **Wejdź w VR** albo **Mixed Reality**.

### B) Lokalnie, przez kabel USB (adb)
```bash
python3 -m http.server 8000            # w katalogu repozytorium
adb reverse tcp:8000 tcp:8000          # Quest podłączony kablem, tryb deweloperski
```
Potem otwórz na Queście `http://localhost:8000` (localhost traktowany jest jak bezpieczny kontekst).

## Parametry URL
- `?seed=42`: inny losowy teren (las, kolory, ukształtowanie).
- `?shadows=0`: wyłącza cienie, jeśli brakuje płynności.

## Struktura
- `src/config.js`: stałe (skala, balistyka, promień rażenia, kratery, mosty) i opcje z menu.
- `src/terrain.js`: generowanie terenu, wody, lasu, wiosek i mostów, przecięcie promienia z terenem, kratery i zniszczenia.
- `src/artillery.js`: modele dział, rozwiązanie balistyczne (zadany kąt lufy), podgląd toru, obszar ostrzału, ogień ciągły i pociski.
- `src/enemies.js`: fale żołnierzy, marsz przez mosty z omijaniem wody, atak na wioskę i trafienia.
- `src/effects.js`: wybuchy, dym, rozbryzgi i dźwięk przestrzenny (generowany proceduralnie).
- `src/table.js`: chwytanie, obracanie i skalowanie platformy jedną albo dwiema rękami.
- `src/hud.js`: panel na nadgarstku i menu opcji.
- `src/main.js`: scena, sesja XR, kontrolery, sterowanie na komputerze i pętla gry.
