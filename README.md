# Stół Artyleryjski VR + Makieta Katastrof (Meta Quest 3 / 3S)

Cztery tryby na lewitującej platformie:
- **Artyleria** (`index.html`): bronisz wioski przed piechotą i czołgami.
- **Makieta katastrof** (`disasters.html`): kwadratowy miniaturowy świat, na którym wywołujesz katastrofy.
- **Stół pinów** (`pins.html`): matryca wysuwanych pinów (shape display), z której rzeźbisz powierzchnie i która manipuluje przedmiotami.
- **Flak** (`flak.html`): obrona przeciwlotnicza na makiecie z artylerii, ze strefą wybuchów, synchronizacją salw i rolą pilota.

Między trybami przełączasz się przyciskiem na stronie albo w menu w VR.

Symulator WebXR: przed Tobą lewituje prostokątna platforma, a na niej miniaturowy kawałek
świata 1 km × 4 km (skala 1:2000, czyli 0,5 m × 2 m). Są tam pagórki, lasy, jezioro, stawy
i pola. Przy bliższej krawędzi stoją Twoje działa, a **za nimi Twoja wioska**. Z dalekiego
końca nadciągają fale piechoty i **czołgów**, omijając wodę, i palą domy we wiosce. Gra kończy
się, gdy spłonie cała wioska. Kolejną falę możesz wysłać w każdej chwili, nawet gdy
poprzednia jeszcze trwa.

Nie trzeba niczego budować ani instalować. To czysty HTML i JavaScript (Three.js jest
dołączony w `vendor/`), który działa w przeglądarce Meta Quest.

## Sterowanie (Quest)

| Przycisk | Akcja |
|---|---|
| **Promień z kontrolera** | celowanie w teren na stole |
| **Spust** | salwa ze wszystkich gotowych dział |
| **Spust 2× szybko** | ogień ciągły: każde działo strzela, gdy tylko się załaduje (kolejny spust = stop) |
| **Prawa gałka ↑/↓** | kąt lufy 15°–85° (im wyżej, tym bardziej pocisk spada z góry) |
| **Prawa gałka ←/→** | zmiana amunicji |
| **Klik prawej gałki** | zablokuj / odblokuj cel w miejscu |
| **Trzymaj A i przesuń promień** | wyznacz prostokątny obszar ostrzału (pociski spadają losowo w obszarze) |
| **A krótko** | usuń obszar |
| **B** | menu opcji (klikasz promieniem i spustem) |
| **Grip, jedna ręka** | chwyć platformę: przesuwanie i obrót |
| **Grip, obie ręce** | skalowanie (0,15× – 25×), obrót i przesuwanie |
| **Lewa gałka** | obrót platformy (←/→) i zoom (↑/↓) wokół punktu, w który celujesz |
| **X** | ustaw platformę przed sobą |
| **Y** | wyślij kolejną falę (nawet gdy poprzednia trwa) |

Na lewym kontrolerze jest panel z falą, liczbą trafień, stanem wioski, kątem lufy,
paskami ładowania każdego działa i odległością/czasem lotu do celu. Menu pojawia się
w tym samym miejscu.

### Amunicja
| Rodzaj | Działanie |
|---|---|
| **Odłamkowo-burząca** | wybuch o promieniu 40 m i lej w ziemi. Niszczy czołg przy bliskim trafieniu, dalsze tylko go uszkadza. |
| **Kasetowa** | rozrywa się ok. 140 m nad celem i rozrzuca 18 podpocisków w promieniu ~65 m. Świetna na piechotę, słaba na czołgi. |
| **Zapalająca** | rozprysk płonących odłamków i strefa ognia (50 m, 14 s). Pali drzewa i domy, zabija piechotę w ogniu i powoli niszczy czołgi. |
| **Głowica atomowa** | strzela tylko jedno działo (środkowe), potem 25 s przerwy. Wybuch to błysk, kula ognia, **grzyb atomowy** i **fala uderzeniowa**. Fala rozchodzi się po terenie i niszczy piechotę, czołgi, drzewa i domy do ok. 450–520 m. Zostawia ogromny lej. |

Czołgi mają 3 punkty wytrzymałości. Uszkodzone jaśnieją, a zniszczone zostają jako dymiące wraki.
Czołgi palą domy z dystansu i szybciej niż piechota.

### Opcje (menu)
- **liczba dział:** 1–8;
- **czas ładowania:** każde działo ma swój, ±15% od wartości z menu;
- **kąt lufy;**
- **szybkość pocisków:** 25%–300%;
- **trudność;**
- **amunicja.**

W menu są też przyciski **Następna fala** i **Nowa gra**.

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

Tryby:
- **Wejdź w VR:** wirtualny pokój.
- **Mixed Reality:** passthrough, czyli platforma unosi się w Twoim prawdziwym pokoju.

## Tryb: Makieta katastrof

Kwadratowy świat 2 × 2 km (0,8 m × 0,8 m na stole). Są w nim:
- miasteczko z siatką ulic, wieżowcami, blokami, domkami i kościołem;
- plaża z parasolami, hotelami i molo, przylądek z latarnią i kawałek morza;
- ośnieżone góry ze zbiornikiem i **tamą**;
- **wulkan**;
- pustynia z wydmami i mesami, pola z farmami, lasy;
- rzeka do morza z mostami i sieć dróg.

Po ulicach i plaży chodzi ~430 ludzików, a po drogach jeździ 80 samochodów. Woda i lawa to prawdziwa
symulacja przepływu po terenie, więc powódź, fala z tamy i tsunami płyną dolinami i ulicami,
a lawa spływa zboczem.

| Katastrofa | Jak działa |
|---|---|
| 🎯 **Lawina** | Śnieg zsuwa się z gór, zasypuje drzewa, drogi i ludzi. Zostawia jęzor śniegu. |
| **Powódź** | Ulewa, wezbrana rzeka i podnoszący się poziom morza zalewają niżej położone tereny. |
| 🎯 **Trzęsienie ziemi** | Makieta się trzęsie, pękają szczeliny, walą się budynki, schodzą osuwiska. Blisko tamy może ją urwać, a pod morzem wywołuje tsunami. |
| 🎯 **Bomba atomowa** | Błysk, grzyb, fala uderzeniowa, lej, wywołane pożary. |
| **Tsunami** | Morze się cofa, potem nadchodzi wysoka fala. Zalewa plażę i miasto, porywa ludzi i auta. |
| 🎯 **Pożar lasu** | Ogień przenosi się z drzewa na drzewo z wiatrem z zachodu i zapala domy. |
| **Urwanie tamy** | Tama pęka, a fala ze zbiornika rusza doliną przez miasto do morza. |
| **Superwulkan** | Wstrząsy i puchnięcie stożka, potem erupcja. Jest kolumna popiołu z błyskawicami, bomby wulkaniczne, spływy piroklastyczne, lawa, opad popiołu i ciemne niebo. |

🎯 oznacza, że wybierasz katastrofę w menu, potem wskazujesz miejsce promieniem i naciskasz spust.
Pozostałe startują od razu. Katastrofy mogą trwać jednocześnie.

Sterowanie w VR:
- spust: uruchom (albo kliknij w menu);
- **B**: menu katastrof;
- **A**: pauza;
- prawa gałka ↑/↓: tempo czasu 0,25×–4×;
- **Y**: odbuduj świat;
- **X**: makieta przed siebie;
- grip: chwyć i skaluj makietę, tak jak w artylerii.

Na komputerze:
- `1`–`8`: wybór katastrofy;
- klik: uruchom w miejscu kursora;
- `Spacja`: pauza;
- `+`/`-`: tempo;
- `R`: odbuduj świat;
- `O`: menu.

## Tryb: Stół pinów

Stół 1,5 × 2 m z matrycą kwadratowych pinów: domyślnie **300 × 400 = 120 000 pinów po 5 mm**, wysuw do 12 cm.
Wysokości pinów siedzą w teksturze, a karta graficzna ustawia każdy pin sama, więc ruch tysięcy pinów naraz nie
obciąża JavaScriptu. Rozdzielczość zmienisz w menu, od 150 × 200 (10 mm) do 400 × 533 (3,75 mm).
Jeśli gogle nie nadążają, zmniejsz ją albo wyłącz „Cienie”.

| Narzędzie | Działanie |
|---|---|
| **Pędzel** | Trzymasz spust i malujesz po pinach. Tryby: podnieś, opuść, wygładź, wyrównaj, zeruj. Prawa gałka ↑/↓ wysuwa lub chowa piny pod promieniem w każdym narzędziu, a ←/→ zmienia wielkość pędzla. |
| **Splajny** | Trzymasz spust na obu rękach i rysujesz w powietrzu dwie krzywe. Po puszczeniu piny wyjeżdżają do powierzchni rozpiętej między nimi. Jedna krzywa daje grzbiet. |
| **Przedmioty** | Prostopadłościan, sześcian, kula i walec z fizyką. Chwytasz je gripem, możesz rzucać. |
| **Wciskanie** | Końcówką kontrolera wciskasz piny jak w glinie (można wyłączyć opcją „Dotyk”). |

Programy, w których piny manipulują przedmiotami (wybierasz w menu, potem spust na przedmiocie):

| Program | Działanie |
|---|---|
| **Podpieraj** | Piny podjeżdżają pod spód, także pod przechylony przedmiot. Gdy puścisz przedmiot w powietrzu, zawisa, aż piny go podeprą. |
| **Przenieś** | Wskazujesz przedmiot i cel. Ściana z pinów pcha przedmiot do celu i hamuje przy nim. |
| **Obracaj** | Trzy obrotowe ramiona z pinów kręcą przedmiotem w miejscu. |
| **Przewróć** | Piny unoszą połowę podstawy i przedmiot przewraca się na inną ścianę. Ogranicznik nie pozwala mu się toczyć dalej. |
| **Podrzuć** | Szybkie wybicie pinami. |
| **Kopiuj kształt** | Piny w innym miejscu odtwarzają kształt przedmiotu na żywo. |

Gotowe kształty:
- płasko;
- teren;
- fale (animacja);
- makieta miasta;
- płaskorzeźba twarzy;
- piramidy;
- kopuła;
- napis;
- **obraz z pliku**: jasność daje wysokość, a piny dostają kolory zdjęcia.

Nad stołem wisi **kamera na bramownicy**. Obok stołu jest monitor z obrazem głębi, na którym widać rozpoznane
przedmioty, ich wymiary, kąt obrotu i wysokość.

Sterowanie w VR:
- spust: narzędzie;
- **A**: tryb pędzla albo program;
- **B**: menu;
- grip przy przedmiocie: chwyć go, w innym miejscu: chwyć stół (oburącz: skala);
- lewa gałka: obrót i zoom stołu;
- **X**: stół przed siebie;
- **Y**: cofnij.

Na komputerze:
- klik: narzędzie;
- `Shift` + przeciągnięcie: maluj albo rysuj splajn (dwa razy, `Enter` dla jednej krzywej);
- `Q`/`E`: podnieś albo opuść;
- `[`/`]`: pędzel;
- `1`–`5`: tryby pędzla;
- `T`: narzędzie;
- `A`: program;
- `Z`: cofnij;
- `O`: menu.

## Tryb: Flak (obrona przeciwlotnicza)

Ta sama makieta 1 × 4 km co w artylerii. Klucze bombowców (a od 3. fali także myśliwców) lecą nad
Twoją wioskę i zrzucają bomby. Klucze manewrują, a gdy obok wybucha flak, robią uniki. Masz do **30 dział**
przeciwlotniczych na krzyżowych podstawach.

- **Strefa wybuchów:** prostopadłościan w powietrzu. W VR **trzymasz A** i rozciągasz go między końcówkami obu
  kontrolerów. Prawa gałka ↑/↓ zmienia wysokość strefy, a ←/→ jej wielkość. Nad strefą widać,
  **za ile sekund** wybuchną pociski.
- **Tryby ognia:**
  - **Zsynchronizowany:** działa same dobierają opóźnienia strzałów, tak by wszystkie pociski wybuchły
    w strefie w jednej chwili, i odliczają czas do wybuchu.
  - **Pojedyncza salwa:** wszystkie gotowe działa strzelają od razu.
  - **Ogień ciągły:** każde działo strzela, gdy tylko się przeładuje. Spust włącza i wyłącza ten tryb.
- **Pociski** mają zapalnik czasowy i wybuchają w powietrzu: błysk, czarny obłok i drobne odłamki. Trafienie
  zależy od prawdopodobieństwa (im bliżej samolotu wybuch, tym większa szansa). Trafiony samolot dymi,
  a zestrzelony spada korkociągiem i rozbija się.
- **Predykcja:** cienkie przerywane linie pokazują tor każdego samolotu na 30 s naprzód, z kropkami co 10 s.
  Żółte romby pokazują, gdzie samoloty będą w chwili wybuchu. Gdy klucz zmienia manewr, predykcja się zmienia.
- **Pilot:** w menu wybierasz rolę „Pilot samolotu”. Prowadzisz klucz bombowców prawą gałką i spustem zrzucasz
  bomby. Działa AI celują w Ciebie z wyprzedzeniem.
- **Podgląd (obraz w obrazie):** z pocisku, zza samolotu albo z kokpitu wybranego samolotu. W VR jest na
  panelu nad lewą ręką, a na komputerze w rogu ekranu. Klik prawej gałki zmienia widok, a klik lewej wybiera
  następny samolot.

Sterowanie w VR:
- spust: ognia (albo bomby jako pilot);
- **B**: menu;
- **Y**: następna fala;
- **X**: makieta przed siebie;
- grip: chwyć makietę;
- lewa gałka: obrót i zoom.

Na komputerze:
- `Spacja`/klik: ognia;
- `Shift` + przeciągnięcie: rzut strefy na teren;
- `W`/`S`: wysokość strefy;
- `Q`/`E`: grubość;
- strzałki: przesuń strefę;
- `1`–`3`: tryb ognia;
- `V`: podgląd;
- `N`: samolot;
- `P`: pilot (strzałki/WASD);
- `F`: fala;
- `L`: predykcja.

## Plany na później

- **Tryb oglądacza (bitwa sama się toczy):** na makiecie artylerii piechota, czołgi, artyleria, flak
  i samoloty obu stron ruszają na siebie same. Wybierasz liczbę i rodzaje jednostek po każdej stronie
  i dokładasz je w trakcie, a sam tylko patrzysz.

## Podgląd na komputerze (artyleria)

- klik / `Spacja`: salwa;
- 2× klik: ogień ciągły (`C` przełącza);
- `Shift` + przeciągnięcie: obszar ostrzału;
- `L`: zablokuj cel (`Esc` odblokowuje);
- `W` / `S`: kąt lufy;
- `1`–`4`: amunicja (odłamkowa, kasetowa, zapalająca, atomowa);
- `F`: następna fala;
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
- `src/config.js`: stałe (skala, balistyka, amunicja, kratery) i opcje z menu.
- `src/terrain.js`: generowanie terenu, wody, lasu i wiosek, przecięcie promienia z terenem, kratery i zniszczenia.
- `src/artillery.js`: modele dział, rozwiązanie balistyczne (zadany kąt lufy), podgląd toru, obszar ostrzału, ogień ciągły i pociski.
- `src/enemies.js`: fale piechoty i czołgów, marsz z omijaniem wody, atak na wioskę i obrażenia.
- `src/effects.js`: wybuchy, dym, ogień, grzyb atomowy, fala uderzeniowa i dźwięk przestrzenny (generowany proceduralnie).
- `src/table.js`: chwytanie, obracanie i skalowanie platformy jedną albo dwiema rękami.
- `src/hud.js`: panel na nadgarstku i menu opcji.
- `src/main.js`: scena, sesja XR, kontrolery, sterowanie na komputerze i pętla gry.
- `src/disasters/world.js`: świat makiety katastrof (teren, drogi, mosty, miasto, tama, drzewa).
- `src/disasters/fluid.js`: symulacja wody i lawy (płytka woda, metoda „wirtualnych rur”).
- `src/disasters/agents.js`: ludziki i samochody (ruch, ucieczka, porwanie przez wodę).
- `src/disasters/scenarios.js`: skrypty katastrof i system pożarów.
- `src/disasters/ui.js`, `src/disasters/main.js`: panel, menu i pętla trybu katastrof.
- `src/pins/pinfield.js`: matryca pinów renderowana na GPU (wysokości w teksturze), ruch pinów i przecięcie promienia.
- `src/pins/physics.js`: fizyka brył sztywnych na powierzchni pinów.
- `src/pins/programs.js`: programy manipulacji przedmiotami (podpieranie, przenoszenie, obracanie, przewracanie, podrzut, kopia).
- `src/pins/tools.js`, `src/pins/presets.js`: pędzel, wciskanie, splajny i powierzchnie oraz gotowe kształty.
- `src/pins/ui.js`, `src/pins/main.js`: panel, menu, monitor kamery i pętla trybu stołu pinów.
- `src/flak/guns.js`: działa przeciwlotnicze (instancje), zapalniki czasowe, synchronizacja salw, wybuchy.
- `src/flak/planes.js`: klucze samolotów, manewry, predykcja toru, bomby, zestrzelenia.
- `src/flak/ui.js`, `src/flak/main.js`: panel, menu, strefa wybuchów, podgląd obraz-w-obrazie i pętla trybu.
