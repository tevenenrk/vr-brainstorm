# Stół Artyleryjski VR + Makieta Katastrof (Meta Quest 3 / 3S)

Siedem trybów na lewitującej platformie, jeden w Twoim pokoju i jeden w okopie w skali 1:1:
- **Artyleria** (`index.html`): bronisz wioski przed piechotą i czołgami.
- **Makieta katastrof** (`disasters.html`): kwadratowy miniaturowy świat, na którym wywołujesz katastrofy.
- **Stół pinów** (`pins.html`): matryca wysuwanych pinów (shape display), z której rzeźbisz powierzchnie i która manipuluje przedmiotami.
- **Flak** (`flak.html`): obrona przeciwlotnicza na makiecie z artylerii, ze strefą wybuchów, synchronizacją salw i rolą pilota.
- **Bitwa** (`battle.html`): dwie armie walczą same, a Ty obserwujesz i dosyłasz posiłki.
- **Bomba w skali** (`nuke.html`): makieta 40 × 40 km z miastem i wybuch jądrowy w prawdziwych proporcjach, ze zwolnionym tempem.
- **Bitwa średniowieczna** (`medieval.html`): miecznicy, łucznicy, włócznicy, kawaleria i katapulty; rozstawiasz i dowodzisz oddziałami albo wcielasz się w żołnierza.
- **Kostucha** (`reaper.html`): horror w Mixed Reality na zeskanowanym pokoju. Z Twoich drzwi wychodzi kostucha i powoli idzie do Ciebie.
- **Obrona okopów** (`trench.html`): stoisz w okopie ze swoją drużyną i odpierasz kolejne fale wroga; amunicja się kończy, a magazynki noszone są w kieszeniach.
- **Godzilla** (`godzilla.html`): jesteś potworem wysokości ok. 95 m i rozbijasz miasto, a budynki rozpadają się stopniowo, zależnie od siły i miejsca uderzenia.

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
  - **Ogień ciągły:** każde działo strzela, gdy tylko się przeładuje. Włącza go **podwójny spust** w każdym
    trybie (albo pojedynczy w trybie „ciągły”), a kolejny spust zatrzymuje.
- **Ustawienia w menu:**
  - promień rażenia pojedynczego pocisku (20–250 m);
  - prędkość samolotów (30–250%);
  - poziom manewrowania: brak, lekkie, średnie albo agresywne. Od niego zależy, jak często i jak ostro klucze
    skręcają, zmieniają wysokość i robią uniki;
  - liczba dział (1–30).
- **Pociski** mają zapalnik czasowy i wybuchają w powietrzu: błysk, czarny obłok i drobne odłamki. Trafienie
  zależy od prawdopodobieństwa (im bliżej samolotu wybuch, tym większa szansa). Trafiony samolot dymi,
  a zestrzelony spada korkociągiem i rozbija się.
- **Predykcja:** cienkie przerywane linie pokazują tor każdego samolotu na 30 s naprzód, z kropkami co 10 s.
  Żółte romby pokazują, gdzie samoloty będą w chwili wybuchu. Gdy klucz zmienia manewr, predykcja się zmienia.
- **Pilot:** w menu wybierasz rolę „Pilot samolotu”. **Siedzisz w kabinie bombowca**, a makieta w skali 1:1 przesuwa się
  i obraca wokół Ciebie (deska rozdzielcza i rama kabiny są stałe, dla wygody). Prowadzisz prawą gałką,
  a spustem zrzucasz bomby. Działa AI celują w Ciebie z wyprzedzeniem.
- **Podgląd z samolotu (rola działa):** obraz w obrazie zza samolotu albo z kokpitu wybranego samolotu.
  W VR jest na panelu nad lewą ręką, a na komputerze w rogu ekranu. Klik prawej gałki zmienia widok,
  a klik lewej wybiera następny samolot.

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

## Tryb: Bitwa (obserwator)

Na makiecie artylerii walczą dwie armie: **Niebiescy** (bliższy koniec) i **Czerwoni** (daleki koniec). Każda ma
piechotę (oddziały po 8), czołgi i działa artyleryjskie.

- **Piechota** idzie naprzód, a gdy widzi wroga, zatrzymuje się i strzela (widać smugi). W lesie ma osłonę.
- **Czołgi** strzelają pociskami odłamkowymi na większy dystans.
- **Artyleria** ostrzeliwuje skupiska wrogów z daleka. Wybuchy zostawiają leje i ranią każdego w zasięgu,
  także własnych.

W menu ustawiasz skład obu armii i zaczynasz nową bitwę. Przyciskami „Posiłki” dosyłasz w trakcie oddziały,
czołgi lub działa dowolnej stronie. Można też zmieniać tempo (0,25–4×) i pauzować. Panel pokazuje siły
obu stron i zwycięzcę.

## Tryb: Bomba w skali

Makieta 40 × 40 km w skali 1:20 000 (2 × 2 m na stole) z miastem z kilku tysięcy budynków, rzeką i wybrzeżem.
Do wyboru są bomby od Little Boy (15 kt) przez W76, W88 i B83 po Castle Bravo i Car-bombę (50 Mt), wybuch
powietrzny lub naziemny.

Wielkości liczone są z przybliżonych wzorów skalujących (rząd wielkości jak w NUKEMAP / Glasstone & Dolan):
- kula ognia;
- strefy 20, 5 i 1 psi;
- oparzenia III stopnia;
- wysokość grzyba i średnica jego czapy.

Strefy widać jako kolorowe pierścienie, a wartości w kilometrach na panelu. Podziałka 10 km przy krawędzi
pomaga ocenić skalę.

Przebieg wybuchu:
1. błysk rozjaśnia całą scenę;
2. kula ognia rośnie, a przy wybuchu powietrznym pojawia się chmura kondensacyjna (Wilsona);
3. fala uderzeniowa biegnie po ziemi z prędkością dźwięku i niszczy budynki według stref;
4. miasto płonie;
5. grzyb wznosi się przez kilka minut.

**Tryb filmowy** sam zwalnia błysk i kulę ognia (nawet 50×), pokazuje falę w normalnym tempie i przyspiesza
wznoszenie chmury. Tempo można też ustawiać ręcznie (0,02–40×).

## Tryb: Bitwa średniowieczna

Pole bitwy 480 × 640 m w skali 1:400 (1,2 × 1,6 m na stole) z pagórkami, lasami, stawem i drogą. Piesze oddziały liczą
~20 ludzi, konne 12, każdy oddział ze sztandarem w kolorze strony i literą rodzaju:

| Oddział | Działanie |
|---|---|
| **Miecznicy** | Szybkie ciosy i tarcza, która zatrzymuje większość strzał lecących z przodu. |
| **Włócznicy** | Dłuższy zasięg i mocniejszy pierwszy cios na nadbiegającego wroga. |
| **Łucznicy** | Strzelają jak najpłaściej (najmniejszy kąt, który doleci do celu, z wyprzedzeniem). Gdy płaski tor zasłaniają swoi, podnoszą łuk tylko tyle, ile trzeba, a jeśli to nie wystarcza, odsuwają się w bok. Nie strzelają w kłębowisko, gdzie przy wrogu stoją swoi. Strzała może zranić swojego. W zwarciu walczą słabo. |
| **Katapulty** | Trzy machiny na kołach, powolne. Rzucają kamieniem po stromym łuku na 45–270 m, niecelnie; kamień rani wszystkich wokół miejsca upadku (także swoich), więc nie strzelają tam, gdzie ich ludzie walczą z wrogiem. Ramię wyrzuca kamień i powoli się naciąga. Słabo wrażliwe na strzały. |
| **Kawaleria** | Jeźdźcy z kopiami, szybcy w galopie. Cios w pędzie (**szarża**) zawsze trafia i zadaje ×2,4 obrażeń. Po kilku sekundach zwarcia odskakują i szarżują znowu. Konie mają pancerz, więc strzały zadają im połowę obrażeń. |

Kawaleria rozbija łuczników i zwykle wygrywa z miecznikami, ale **włócznicy** są jej kontrą: zadają koniom
×2,5 obrażeń.

Oddział, który straci 2/3 ludzi przy wrogu, **ucieka** i po kilkunastu sekundach się zbiera. Oddział stojący
bez rozkazu albo po dojściu na miejsce sam kontratakuje wroga, który podejdzie.

**Dowodzenie (widok makiety):**
- Przeciągnięcie spustem po terenie zawsze zaznacza prostokątem wszystkie oddziały w środku i zastępuje
  poprzednie zaznaczenie.
- Krótkie kliknięcie na żołnierza albo sztandar dodaje oddział do zaznaczenia albo go z niego usuwa.
- **Dwuklik** w ten sam cel wysyła oddziały **biegiem** (szybki marsz albo atak biegiem).
- Maszerujące oddziały słychać: tupot kroków z pobrzękiwaniem zbroi, jazda niżej i ciężej.
- Klik prawej gałki odznacza wszystko.
- Gdy kontroler celuje w teren, w miejscu docelowym widać **zarys szyku**, czyli kropki w miejscu każdego żołnierza:
  - piechota (żółte) stoi w linii frontu, łucznicy (zielone) za nią, a jazda (pomarańczowa) na skrzydłach;
  - kolejność oddziałów zostaje taka jak obecnie, więc się nie krzyżują;
  - strzałka pokazuje, gdzie będzie front.
- Front jest zgodny z kierunkiem kontrolera: wojsko patrzy tam, gdzie celujesz. Skręt nadgarstka obraca linię,
  a prawa gałka ←→ ją dokręca. Przytrzymanie spustu blokuje miejsce, więc możesz spokojnie obrócić linię,
  a puszczenie spustu wydaje rozkaz marszu.
- Spust na wroga: wszystkie zaznaczone oddziały atakują.

**Wygląd:** piechota (miecznicy, włócznicy, łucznicy) to model rycerza z animacją biegu, przyciemniony na kolor
strony. Animacja jest „wypieczona” do 10 klatek i rysowana instancyjnie: setki żołnierzy kosztują kilkanaście
wywołań rysowania. Model ma dwa poziomy szczegółów: ok. 700 trójkątów na makiecie i ok. 2400 z bliska oraz
po wcieleniu. Broń i tarcza (w barwach strony) trzymają się dłoni.

**Rozstawianie:** przed startem bitwy (pauza) oddział od razu staje we wskazanym miejscu na Twojej połowie.
Przed startem możesz rozstawić także czerwonych. W trakcie bitwy czerwoni walczą sami.

Przyciski:
- **A**: start/pauza;
- **B**: menu (dodawanie oddziałów obu stron, gotowe armie, tempo);
- lewy **Y**: wcielenie w żołnierza.

**Wcielenie w żołnierza:** przejmujesz jednego człowieka z zaznaczonego oddziału, a świat robi się 1:1.
- **Ruch:** chodzisz lewą gałką (albo fizycznie po pokoju), a prawą gałką obracasz się skokowo.
- **Jeździec:** jako kawalerzysta siedzisz wyżej i poruszasz się szybciej. Cios kopią w pędzie to szarża.
- **Walka:** w VR mieczem, włócznią i kopią nie trzeba klikać. Liczy się fizyczne trafienie: ostrze musi przeciąć
  sylwetkę wroga w zamachu, a szybszy zamach zadaje większe obrażenia. Na komputerze bijesz kliknięciem. Łuk napinasz,
  trzymając spust, i strzelasz, puszczając go. Siła strzału zależy od tego, jak długo napinasz.
- **Rozkazy:** wydajesz tylko swojemu oddziałowi, a pozostałe oddziały walczą same:
  - lewy spust na ziemię: „tam!”;
  - lewy spust na wroga: „atak!”;
  - **X**: „za mną!”;
  - **Y**: „do ataku!”.

Twój oddział chodzi za Tobą. Lewy spust na wrogi oddział (wskazany oddział podświetla się na czerwono) sprawia,
że oddział rusza na niego **biegiem**, a po rozbiciu wroga wraca za Tobą. Każde trafienie mieczem, włócznią
albo strzałą daje wibrację kontrolera, białe **X** na środku widoku i krótkie „tyk”. Zabicie daje czerwone,
większe X i podwójny dźwięk.

Gdy zginiesz, wracasz do widoku makiety.

Na komputerze w roli żołnierza:
- `WASD`: chód;
- prawy przycisk myszy: rozglądanie;
- klik: cios albo strzał;
- `F`, `G`, `T`: rozkazy;
- `Q`: wyjście.

## Tryb: Kostucha (Mixed Reality)

Horror na Twój prawdziwy pokój. Strona prosi o dostęp do skanu przestrzeni (WebXR `plane-detection` i
`mesh-detection`) i odczytuje z niego podłogę, ściany, meble i ramy drzwi.

**Przebieg:**
1. Pokój lekko ciemnieje i zaczyna buczeć niskie tło.
2. Za drzwiami słychać ciężkie, zbliżające się kroki (dźwięk przestrzenny).
3. Zapalają się **całe drzwi**: płonie cała powierzchnia i rama. Po chwili ogień przepala je na wylot
   w portal, a za nim jest ciemny, rozżarzony korytarz z kostuchą o żarzących się oczach. Kostucha
   przechodzi przez ognistą zasłonę.
4. Kostucha przechodzi przez ogień i powoli (0,5 m/s) idzie do Ciebie. Omija meble ze skanu (siatka nawigacyjna
   z marginesem i A*), a gdy się ruszasz, przelicza trasę. Gdy jest już w pokoju, portal gaśnie.
   Pokój ciemnieje, a bicie serca przyspiesza.
5. Z odległości ok. 1,8 m unosi kosę i mówi **„Już czas”**.
6. Tnie poziomo na wysokości szyi. W chwili cięcia obraz robi się **całkowicie czarny**.
7. Po kilku sekundach w oddali pojawia się małe światło. Rośnie i oświetla otoczenie, a wtedy widać, że stoisz
   w ciemnym tunelu.
8. Światło zbliża się najpierw powoli, potem coraz szybciej, aż wszystko zalewa biały blask.
9. Za blaskiem jest **miejsce sądu**: lewa połowa to niebo z perłową bramą i złotymi kratami, prawa to piekło
   z kamienną bramą najeżoną kolcami i wirem ognia. Pod stopami po lewej są chmury, po prawej lawa.
10. Przed Tobą stoi **waga**. Każde kliknięcie lewego spustu dokłada jasną kulkę na lewą szalę, a prawego
    rozżarzoną na prawą. Po ok. 11 kliknięciach przewagi waga się przechyla.
11. Lewa szala w dół: biały błysk i stoisz w **chmurach**, nad morzem obłoków, w słońcu, wśród złotych drobinek.
    Prawa szala w dół: ognisty błysk i stoisz na skale w **piekle**, wśród lawy, słupów ognia i iskier.
12. Po kilku sekundach spust zaczyna scenę od nowa.

Na komputerze w miejscu sądu: lewy lub prawy przycisk myszy (albo strzałki ← →) dokłada na szale.

**Zasłanianie:** meble i ściany ze skanu są w scenie jako niewidoczne bryły. Kostucha chowa się za kanapą,
a zza drzwi widać ją tylko przez uchyloną szczelinę.

**Drzwi:**
- Brane są ze skanu. Przy kilku drzwiach wybierane są najdalsze od Ciebie.
- Jeśli skan nie ma drzwi, kostucha wychodzi ze środka najdalszej ściany.
- Jeśli nie ma żadnego skanu, przed Tobą otwiera się portal.
- Przycisk „Wskaż drzwi ręcznie” pozwala wskazać miejsce promieniem kontrolera.

**Przygotowanie na Queście:**
- Zrób skan pokoju: Ustawienia → Przestrzeń fizyczna → Ustawienia przestrzeni. Jeśli drzwi nie zostały wykryte,
  dodaj je ręcznie. Przycisk „Zeskanuj pokój” w trybie też uruchamia skanowanie.
- Przy wejściu w Mixed Reality zezwól na dostęp do danych przestrzeni.
- Najlepiej w słuchawkach.

Sterowanie: spust — przyciski panelu, **B** w trakcie sceny — przerwij. „Skan: pokaż” rysuje wykrytą
podłogę, ściany, meble, drzwi i trasę kostuchy.

Tryb VR i podgląd na komputerze używają pokoju zastępczego (4,2 × 5 m ze stołem, kanapą i regałem).
Na komputerze:
- `Spacja`: start;
- `WASD` i przeciąganie myszą: ruch i rozglądanie;
- `M`: widok z góry;
- `K`: skan i ścieżka;
- `P`: wskaż drzwi;
- `Esc`: przerwij.

Postać to model `assets/reaper/reaper.glb` (szkielet Mixamo z animacją biegu, tekstury skompresowane do WebP,
ok. 2 MB). Chód powstaje ze zwolnionego biegu o zmniejszonym zasięgu ruchów. Kosa jest dorobiona w kodzie, a ręce
trzymają ją dzięki kinematyce odwrotnej (IK). Oczy żarzą się, a głowa śledzi gracza. Jeśli modelu nie uda się
wczytać, pojawia się prosta kostucha zastępcza.

Głos „Już czas” to plik `assets/reaper/juz_czas.mp3` (syntezator mowy obniżony i z pogłosem). Możesz go podmienić
na własne nagranie o tej samej nazwie. Jeśli pliku brak, mówi syntezator przeglądarki.

## Plany na później

- W trybie bitwy: samoloty i flak obu stron.

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

## Tryb: Obrona okopów

Widok 1:1 (VR albo komputer). Stoisz w linii okopów z drużyną 8 obrońców. Z mgły po drugiej stronie ziemi niczyjej
(ok. 130–150 m, leje po pociskach, dwa pasy drutu kolczastego z przejściami) nadciągają **fale** wroga: biegną
skokami, przyklękają za osłoną i strzelają, a z bliska rzucają granaty. Każda fala jest większa (8 + 5 × numer fali).
Kto dobiegnie, wskakuje do okopu i ściga obrońców po **labiryncie** łączników, ślepych zaułków i okopu wspierającego
(znajduje drogę A*). Z okopu można **wyjść po drabince** (cztery przy stanowiskach strzeleckich — na przedpole,
dwie przy tylnej ścianie okopu wspierającego): podejdź i idź w jej stronę albo chwyć szczebel, a wspinasz się sam.
Na przedpolu chodzisz swobodnie (przez drut kolczasty powoli), ale jesteś odsłonięty; wracasz po drabince albo
wskakując do okopu. Między falami masz 25 s na uzupełnienie amunicji; po każdej fali przychodzi najwyżej 3 obrońców
w posiłkach. Falę możesz też **wezwać sam** w każdej chwili (menu → „Wezwij falę teraz”, na komputerze `N`), nawet gdy
poprzednia trwa; przełącznik „Fale: automatyczne / na żądanie” wyłącza samoczynne nadchodzenie fal.

Część atakujących niesie **granaty dymne**: z 30–95 m od okopu rzucają je przed siebie i biegną za zasłoną. Dym
(chmura ok. 15 m, ~40 s, znosi go wiatr) zasłania widok Tobie i obrońcom, a wrogom za nim — Ciebie.

**Wsparcie artylerii** (raz na minutę; wciśnięcie gałki dowolnego kontrolera albo przycisk „Artyleria” w menu): wskaż cel na przedpolu, a po ~2 s spada salwa 9 pocisków w promieniu 9 m
(świst nadlatujących pocisków, potężne wybuchy). Celu nie da się wskazać tuż przed własnym okopem.

**Okop:** stanowiska strzeleckie przy przedpiersiu z workami — stojąc, widzisz i strzelasz ponad workami, a gdy
**kucniesz**, chowasz się (wróg widzi tylko to, co wystaje). Łączniki i okop wspierający są głębsze — głowa jest
poniżej gruntu. Wysokość dopasowuje się sama do Twojego wzrostu po wejściu w VR (w menu: „Dopasuj wzrost”).

**Broń** jest przedmiotem: puszczona przy kaburze / na plecach chowa się, a puszczona gdziekolwiek indziej upada na
ziemię (można ją podnieść chwytem albo przyciągnąć spustem pustej ręki). Chwyt drugą dłonią na broni trzymanej w pierwszej
przekłada ją do tej dłoni (chwyt na łożu broni długiej = trzymanie oburącz). Broń główna (do wyboru w menu, pozostałe leżą
na stole w ziemiance; można też zabrać broń poległego):
- **karabin** (seria, kolimator), **snajperka** (5 naboi, zamek po każdym strzale, luneta 12× — w goglach na tylnej
  soczewce widać powiększony obraz z krzyżem), **granatnik** (pocisk po łuku, wybuch przy uderzeniu; ładuje się pojedynczo
  — wyrzuć łuskę A/X i włóż nowy nabój do komory).
Sojusznicy i wrogowie też mają różną broń: strzelcy wyborowi wroga zatrzymują się 85–135 m od okopu i strzelają z daleka,
grenadierzy (od 2. fali) ostrzeliwują okopy granatami. Amunicja do każdej broni jest osobna (5 skrzyń w arsenale, łup z
poległych zależy od ich broni).
- karabin automatyczny (30 naboi, licznik naboi na boku) z **kolimatorem**: czerwona kropka w pierścieniu jest widoczna
  temu oku, które patrzy przez okienko wzdłuż lufy (każde oko liczone osobno) — i wtedy wskazuje dokładnie miejsce trafienia,
- pistolet (12 naboi),
- granaty (zapalnik 3,6 s),
- nóż (trafienie ostrzem w ruchu),
- **miniguny** na trzech stanowiskach: amunicja bez końca, ale po ~7 s ciągłego ognia lufy rozgrzewają się
  do czerwoności i broń się **przegrzewa** — trzeba poczekać, aż ostygnie (wskaźnik na broni, para z luf).

**Amunicja jest skończona** — dla wszystkich. Magazynki nosisz w **kieszeniach** (ładownice na pasie: 4 magazynki
karabinu, 3 pistoletu, 3 granaty). Więcej jest w **arsenale** w ziemiance za okopem wspierającym (skrzynie z licznikiem
zapasu). Poległym (swoim i wrogom) można zabrać magazynki i granaty. Obrońcy też mają ograniczony zapas: gdy go
wystrzelają, idą do arsenału, a gdy ten jest pusty — szukają amunicji przy poległych.

**Sterowanie VR (wszystko fizycznie):**
- **chwyt (grip)** przy prawym biodrze (z tyłu) — pistolet; za prawym ramieniem — karabin; wysoko na lewej piersi — nóż;
  puszczona broń wraca na swoje miejsce;
- **chwyt przy pasie z przodu** — magazynek karabinu z lewej ładownicy, granat z prawej; magazynki pistoletu na lewym
  boku. Łapie zawsze najbliższy slot, a slot pod wolną dłonią podświetla się kolorową kulką i lekko drga;
- **pusta ręka + spust** — wskazany kontrolerem najbliższy przedmiot (magazynek, granat — także cudzy, uzbrojony,
  do odrzucenia — łup z poległego albo zapas ze skrzyni arsenału, do 15 m) **przylatuje do dłoni**;
- **wciśnięcie gałki** (dowolnej) — artyleria: promień z kontrolera i okrąg celu na ziemi (zielony = można strzelać),
  spust tej ręki = ogień, ponowne wciśnięcie gałki = anuluj;
- **spust** — strzał (karabin seriami, pistolet pojedynczo); z granatem w dłoni spust wyciąga zawleczkę,
  puszczenie chwytu = rzut (siła z najszybszej chwili ruchu ręki, wzmocniona — granat leci kilkadziesiąt metrów);
- **A / X** — wyrzuć magazynek z broni w tej dłoni; nowy magazynek **przyłóż do gniazda** broni (pod spodem),
  a sam wskoczy na miejsce;
- puszczony **przy ładownicy** magazynek albo granat trafia do kieszeni (jeśli jest miejsce, pusty magazynek nie);
- chwyt w skrzyni arsenału — magazynek/granat z zapasu; chwyt przy ciele poległego — jego magazynek albo granat;
- lewa dłoń na łożu karabinu — trzymanie oburącz;
- **minigun:** chwyć uchwyty z tyłu (jedną albo dwiema rękami), celujesz, przesuwając dłonie, spust — ogień;
- lewa gałka — chód po okopie, prawa — obrót o 30°, **Y / B** — menu (pauza, od nowa, wzrost, inne tryby);
- panel na lewym nadgarstku: życie, naboje, kieszenie, arsenał, fala.

Trafienie wroga daje znacznik X, „tyk” i wibrację. Gdy dostajesz, ekran czerwienieje; życie odnawia się po kilku
sekundach bez trafień. Kule przelatujące obok świszczą.

**Na komputerze:** klik — przechwyć mysz, `WASD` (`Shift` bieg), `C` — kucnij, LPM — strzał, PPM — celowanie przez
przyrządy, `1`–`4` — karabin/pistolet/granat/nóż, `R` — przeładuj z kieszeni, `G` — granat, `E` — minigun (wejdź/zejdź)
albo uzupełnij w arsenale / zabierz poległemu / podnieś, `F` — przyciągnij wskazany przedmiot (trafia do kieszeni),
`T` — artyleria (cel celownikiem, LPM — ogień), `Q` — upuść broń, `E` przy leżącej broni — weź ją (zamiana), `N` — wezwij falę, `Spacja` — drabinka, `Enter` — start/pauza, `O` — menu.

## Tryb: Godzilla

Widok 1:1 w skali potwora (rig jest powiększony ok. 60×, więc miasto wygląda jak makieta pod stopami, a zawalenia
trwają tyle, ile trwałyby naprawdę). Wychodzisz z zatoki do miasta z ok. 120 budynków: kamienice z cegły, biurowce
z betonu i szklane wieżowce w śródmieściu, plus zaparkowane auta.

**Jak rozpadają się budynki.** Każdy budynek składa się z segmentów (jedno piętro × 4 m × 4 m). Segment ma strop,
słupy, ściankę działową i — na zewnątrz — płyty fasady (okna, okładzinę, dach). Uszkodzenia są liczone, a nie
odgrywane z gotowej animacji:
- **siła ciosu** = prędkość ręki² (lub ogona, tułowia, rzuconego przedmiotu). Lekkie pchnięcie tylko zbija szyby
  i rysuje okładzinę (płyty fasady pękają, potem odpadają), średni cios wybija segment, mocny przebija się w głąb;
- **energia rozchodzi się po konstrukcji** — najwięcej w kierunku ciosu, mniej na boki. To, czego nie zniszczy,
  zostaje jako pęknięcia (ciemniejsze segmenty), więc kolejne ciosy w to samo miejsce kruszą coraz łatwiej;
- **podparcie**: po każdej zmianie liczona jest ścieżka obciążenia do gruntu. Wspornik ma ograniczony zasięg
  (kamienica 1 segment, biurowiec 2, wieżowiec 3). Co traci podparcie, odpada jako **bryła sztywna** — spada,
  obraca się, odbija i przechyla na resztkach konstrukcji;
- **spadająca bryła miażdży** to, na co spadnie (energia zależy od jej masy i prędkości uderzenia), a sama też się
  kruszy — dlatego oderwana góra wieżowca przebija kolejne piętra (zawalenie piętro po piętrze);
- **przeciążenie**: ciężar pięter nad brakującymi segmentami przechodzi na sąsiednie słupy. Nadwyrężone
  i przeciążone segmenty pękają po chwili (słychać trzeszczenie), więc podcięty z jednej strony budynek łamie się
  stopniowo i przechyla w stronę zniszczeń;
- gruz, odłamki szkła, płyty stropów i pył lecą zgodnie z kierunkiem ciosu, a gruz układa się w hałdy.

**Sterowanie VR:** pazury biją, gdy w coś trafisz (siła z szybkości ruchu ręki); **chwyt (grip)** przy budynku wyrywa
segment, przy aucie albo dużym kawałku gruzu — łapie go; puszczony w ruchu przedmiot leci i uderza w budynki;
**spust** — oddech atomowy (tam, gdzie patrzysz; rozgrzewa i rozsadza segmenty, ok. 6 s, potem odpoczynek);
**A/X** — ryk (pękają szyby w okolicy); lewa gałka — chód (stopy depczą auta i to, co pod nimi), prawa — obrót,
klik prawej gałki — zamach ogonem, ogon zahacza o budynki także przy skrętach; **Y/B** — menu: odbudowa miasta,
rozmiar potwora (55 / 95 / 145 m), zwolnione tempo. Na lewym nadgarstku: procent zniszczeń, zburzone budynki,
siła ostatniego i najmocniejszego ciosu, zapas oddechu.

**Walka z robotem** (menu → „Walka z robotem”, na komputerze `B`): nadchodzi robot podobnej wielkości i boksuje —
proste, sierpowe i podbródkowe, czasem kombinacja; robi gardę, gdy widzi nadlatującą pięść. Twoje ciosy liczą się
z szybkości ręki (głowa ×1,5, garda pochłania większość), trafiony robot się zatacza i bywa odrzucony na budynki.
Jego ciosy zablokujesz dłonią przed twarzą; trafienie czerwieni obraz i odpycha cię do tyłu. Robot depcze i taranuje
miasto, a po nokaucie wali się na budynki. Oddech atomowy i rzucone przedmioty też go ranią.

**Na komputerze:** `WASD` (`Shift` szybciej), mysz — rozglądanie, LPM / PPM — lewa / prawa pięść (przytrzymaj, by
uderzyć mocniej), `F` (trzymaj) — oddech, `R` — ryk, `E` — chwyć / rzuć, `T` — ogon, `M` — zwolnione tempo,
`1`–`3` — rozmiar, `Enter` — odbuduj miasto, `O` — menu.

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
- `src/flak/ui.js`, `src/flak/main.js`: panel, menu, strefa wybuchów, podgląd obraz-w-obrazie, kabina pilota i pętla trybu.
- `src/battle/army.js`, `src/battle/main.js`: symulacja dwóch armii (piechota, czołgi, artyleria) i tryb obserwatora.
- `src/nuke/world.js`, `src/nuke/blast.js`, `src/nuke/main.js`: makieta 40 × 40 km z miastem, model i wizualizacja wybuchu jądrowego.
- `src/medieval/knight.js`: wypiekanie animacji modelu rycerza (`assets/medieval/knight_*.glb`) do klatek.
- `src/medieval/world.js`, `src/medieval/army.js`, `src/medieval/main.js`: pole bitwy, oddziały średniowieczne (szyki, walka wręcz, łucznictwo, morale), dowodzenie i wcielenie w żołnierza.
- `src/reaper/room.js`, `src/reaper/reaper.js`, `src/reaper/fire.js`, `src/reaper/afterlife.js`, `src/reaper/audio.js`, `src/reaper/main.js`: tryb Kostucha.
  - Odczyt skanu pokoju z WebXR i siatka nawigacyjna z A*.
  - Model z IK rąk i kosą.
  - Płonący portal w drzwiach (stencil, cząsteczki ognia).
  - Tunel ze światłem.
  - Miejsce sądu z wagą, niebo i piekło (`judgement.js`).
  - Dźwięki proceduralne i przebieg sceny.
- `src/godzilla/city.js` (miasto, segmenty, uderzenia, podparcie i obciążenia), `src/godzilla/physics.js` (gruz, bryły sztywne, pył), `src/godzilla/kaiju.js` (ciało, ogon, oddech), `src/godzilla/robot.js` (robot-bokser), `src/godzilla/audio.js`, `src/godzilla/main.js`: tryb Godzilla.
- `src/trench/world.js`, `src/trench/soldiers.js`, `src/trench/gear.js`, `src/trench/smoke.js` (zasłony dymne), `src/trench/audio.js`, `src/trench/main.js`: tryb Obrona okopów.
  - Mapa okopów na siatce 1 m (stanowiska, łączniki, ziemianka), teren z lejami i drutem, linia wzroku i A*.
  - Żołnierze z części instancjonowanych, AI natarcia, walki w okopie i zaopatrzenia.
  - Broń, magazynki, granaty z fizyką, miniguny z przegrzewaniem, efekty.
  - Kieszenie, kabury, interakcje VR, sterowanie na komputerze, fale i dźwięki proceduralne.
