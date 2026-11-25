// Name pools for OPV recruits. Every agent is Catholic, so first names are
// baptismal (saints' names in the local form) and surnames are local.
// In China, Korea and Vietnam the baptismal name goes first ("Joseph Wang").

interface Culture {
  male: string[];
  female: string[];
  surnames: string[];
}

export const CULTURES = {
  italian: {
    male: ["Matteo", "Giovanni", "Francesco", "Luca", "Marco", "Alessandro", "Giuseppe", "Pietro", "Andrea", "Lorenzo", "Stefano", "Tommaso", "Domenico", "Raffaele", "Benedetto"],
    female: ["Chiara", "Giulia", "Francesca", "Maria", "Caterina", "Lucia", "Agnese", "Teresa", "Elena", "Benedetta"],
    surnames: ["Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo", "Ricci", "Marino", "Greco", "Bruno", "Gallo", "Conti", "De Luca", "Mancini", "Costa", "Giordano", "Lombardi", "Moretti", "Barbieri", "Fontana", "Santoro", "Mariani", "Rinaldi", "Caruso"],
  },
  iberian: {
    male: ["Javier", "José", "Miguel", "Santiago", "Diego", "Pablo", "Ignacio", "Francisco", "João", "Tiago", "Rui", "Álvaro", "Andrés", "Domingo", "Luís"],
    female: ["María", "Carmen", "Pilar", "Lucía", "Teresa", "Inês", "Beatriz", "Mariana", "Rosario", "Montserrat"],
    surnames: ["García", "Fernández", "González", "Rodríguez", "López", "Martínez", "Sánchez", "Pérez", "Gómez", "Ruiz", "Navarro", "Iglesias", "Silva", "Santos", "Ferreira", "Pereira", "Oliveira", "Costa", "Carvalho", "Sousa", "Aguirre", "Echeverría", "Castells"],
  },
  french: {
    male: ["Jean", "Pierre", "Louis", "Antoine", "Benoît", "Étienne", "Théo", "Mathieu", "Dominique", "Bernard", "Pieter", "Jan", "Willem", "Thomas", "Hugo"],
    female: ["Marie", "Claire", "Anne", "Thérèse", "Bernadette", "Camille", "Sophie", "Geneviève", "Lieve", "Elise"],
    surnames: ["Martin", "Bernard", "Dubois", "Durand", "Leroy", "Moreau", "Laurent", "Lefebvre", "Girard", "Rousseau", "Fontaine", "Chevalier", "Peeters", "Janssens", "Maes", "Jacobs", "Van den Berg", "De Smet", "Lambert", "Mercier"],
  },
  irish: {
    male: ["Patrick", "Sean", "Michael", "Thomas", "Kevin", "Declan", "Ciarán", "Brendan", "Liam", "Aidan", "Joseph", "Francis", "Gerard", "Finbar", "Colm"],
    female: ["Bridget", "Mary", "Siobhán", "Niamh", "Aoife", "Catherine", "Margaret", "Clare", "Róisín", "Bernadette"],
    surnames: ["Murphy", "Kelly", "O'Sullivan", "Walsh", "O'Brien", "Byrne", "Ryan", "O'Connor", "O'Neill", "Doyle", "McCarthy", "Gallagher", "Kennedy", "Lynch", "Quinn", "Brennan", "Fitzgerald", "Nolan", "Gilmore", "Fallon"],
  },
  german: {
    male: ["Johannes", "Josef", "Matthias", "Michael", "Benedikt", "Lukas", "Andreas", "Stefan", "Franz", "Florian", "Maximilian", "Thomas", "Alois", "Leonhard", "Konrad"],
    female: ["Maria", "Theresia", "Anna", "Katharina", "Elisabeth", "Hildegard", "Magdalena", "Johanna", "Veronika", "Barbara"],
    surnames: ["Müller", "Schmid", "Huber", "Wagner", "Bauer", "Gruber", "Hofer", "Fischer", "Weber", "Brunner", "Steiner", "Moser", "Keller", "Graf", "Lehmann", "Berger", "Hartmann", "Vogel", "Zimmermann", "Kaiser"],
  },
  polish: {
    male: ["Jan", "Piotr", "Paweł", "Tomasz", "Krzysztof", "Andrzej", "Marek", "Stanisław", "Wojciech", "Józef", "Kacper", "Maksymilian", "Jakub", "Michał", "Kazimierz"],
    female: ["Maria", "Anna", "Faustyna", "Katarzyna", "Małgorzata", "Agnieszka", "Jadwiga", "Teresa", "Zofia", "Barbara"],
    surnames: ["Nowak", "Kowalski", "Wiśniewski", "Wójcik", "Kowalczyk", "Kamiński", "Lewandowski", "Zieliński", "Szymański", "Woźniak", "Dąbrowski", "Kozłowski", "Mazur", "Krawczyk", "Kaczmarek", "Piotrowski", "Grabowski", "Pawlak", "Michalski", "Zając"],
  },
  central: {
    male: ["Jan", "Josef", "Václav", "Tomáš", "Petr", "Pavol", "Martin", "István", "László", "József", "Ferenc", "Gábor", "Miroslav", "Ondřej", "Imre"],
    female: ["Marie", "Anežka", "Ludmila", "Zuzana", "Katarína", "Erzsébet", "Mária", "Ilona", "Terézia", "Veronika"],
    surnames: ["Novák", "Svoboda", "Dvořák", "Černý", "Procházka", "Horváth", "Kovács", "Szabó", "Tóth", "Nagy", "Varga", "Kováč", "Baláž", "Molnár", "Veselý", "Polák", "Krejčí", "Farkas", "Németh", "Hudák"],
  },
  balkan: {
    male: ["Ivan", "Josip", "Marko", "Luka", "Ante", "Stjepan", "Tomislav", "Matej", "Gjergj", "Pjetër", "Nikola", "Anton", "Frano", "Mihael", "Dominik"],
    female: ["Marija", "Ana", "Katarina", "Ivana", "Lucija", "Tereza", "Mara", "Klara", "Dora", "Agneza"],
    surnames: ["Horvat", "Kovačević", "Babić", "Marić", "Jurić", "Novak", "Knežević", "Vuković", "Perić", "Matić", "Gjoni", "Prenga", "Marku", "Kolar", "Zupan", "Krajnc", "Petrović", "Pavlović", "Radić", "Šarić"],
  },
  nordic: {
    male: ["Erik", "Olav", "Anders", "Lars", "Henrik", "Johan", "Mikael", "Nils", "Ansgar", "Magnus", "Peter", "Jonas", "Bernt", "Kristian", "Thomas"],
    female: ["Birgitta", "Karin", "Ingrid", "Kristin", "Sigrid", "Elin", "Maria", "Helena", "Sofia", "Marta"],
    surnames: ["Johansson", "Andersson", "Nilsson", "Larsen", "Hansen", "Olsen", "Virtanen", "Korhonen", "Nieminen", "Berg", "Lund", "Dahl", "Holm", "Lindqvist", "Sørensen", "Nordin", "Eriksen", "Halvorsen", "Jensen", "Strand"],
  },
  ukrainian_baltic: {
    male: ["Andriy", "Mykola", "Petro", "Yosyf", "Vasyl", "Taras", "Ostap", "Jonas", "Kazimieras", "Vytautas", "Antanas", "Pranas", "Roman", "Bohdan", "Yaroslav"],
    female: ["Mariya", "Olena", "Oksana", "Iryna", "Sofiya", "Ona", "Rūta", "Agnė", "Kateryna", "Halyna"],
    surnames: ["Kovalenko", "Shevchenko", "Bondarenko", "Tkachenko", "Kravchenko", "Melnyk", "Hrytsenko", "Sheptytsky", "Kazlauskas", "Petrauskas", "Jankauskas", "Butkus", "Stankevičius", "Lysenko", "Moroz", "Savchuk", "Vasylenko", "Zelinsky", "Ozols", "Bērziņš"],
  },
  russian: {
    male: ["Aleksandr", "Mikhail", "Pavel", "Sergei", "Andrei", "Nikolai", "Dmitri", "Iosif", "Konstantin", "Aleksei", "Yuri", "Viktor", "Leonid", "Anton", "Oleg"],
    female: ["Mariya", "Yelena", "Anna", "Tatyana", "Olga", "Irina", "Natalya", "Yekaterina", "Vera", "Lyudmila"],
    surnames: ["Ivanov", "Smirnov", "Kuznetsov", "Popov", "Sokolov", "Morozov", "Volkov", "Lebedev", "Kozlov", "Novikov", "Orlov", "Zaitsev", "Pavlov", "Belov", "Gerber", "Schulz", "Kowalski", "Rybakov", "Tarasov", "Fedorov"],
  },
  central_asian: {
    male: ["Ivan", "Pavel", "Aleksandr", "Iosif", "Yerlan", "Nurlan", "Ruslan", "Timur", "Andrei", "Viktor", "Daniyar", "Sergei", "Otto", "Bolat", "Mikhail"],
    female: ["Mariya", "Anna", "Aigerim", "Dinara", "Yelena", "Gulnara", "Svetlana", "Olga", "Aliya", "Irina"],
    surnames: ["Abenov", "Iskakov", "Nurlanov", "Bekov", "Seitkali", "Wagner", "Schmidt", "Kim", "Tsoi", "Pak", "Ivanov", "Popov", "Batbayar", "Ganbold", "Dorj"],
  },
  armenian_caucasian: {
    male: ["Grigor", "Hovhannes", "Petros", "Gevorg", "Vardan", "Krikor", "Mikael", "Andranik", "Davit", "Giorgi", "Levan", "Nikoloz", "Sargis", "Tigran", "Aram"],
    female: ["Mariam", "Anahit", "Nune", "Lusine", "Tamar", "Nino", "Ani", "Shushan", "Gayane", "Ketevan"],
    surnames: ["Petrosyan", "Grigoryan", "Hovhannisyan", "Sargsyan", "Harutyunyan", "Vardanyan", "Mkrtchyan", "Kevorkian", "Beridze", "Kapanadze", "Gelashvili", "Lomidze", "Avetisyan", "Ghazaryan", "Melikyan"],
  },
  levantine: {
    male: ["Elias", "Boutros", "Youssef", "Antoine", "Georges", "Charbel", "Toufic", "Rafiq", "Michel", "Nabil", "Jibril", "Hanna", "Fadi", "Bashir", "Emile"],
    female: ["Mariam", "Rita", "Thérèse", "Nour", "Rafqa", "Layal", "Hala", "Joumana", "Mona", "Salma"],
    surnames: ["Khoury", "Haddad", "Saad", "Karam", "Hanna", "Gemayel", "Nasrallah", "Aoun", "Chamoun", "Frangieh", "Matta", "Sfeir", "Daher", "Rahme", "Yacoub", "Toma", "Shamoun", "Isho", "Kassab", "Bakhos"],
  },
  coptic: {
    male: ["Mina", "Girgis", "Boutros", "Antonios", "Youssef", "Marcos", "Bishoy", "Kyrillos", "Fady", "Ramy", "Samir", "Makary", "Andrawis", "Tadros", "Shenouda"],
    female: ["Mariam", "Demiana", "Marina", "Irini", "Nevine", "Mervat", "Hanaa", "Sawsan", "Verena", "Mona"],
    surnames: ["Girgis", "Hanna", "Boutros", "Tadros", "Ibrahim", "Mikhail", "Fahmy", "Ghali", "Abdelmalek", "Wissa", "Habib", "Rizk", "Gaid", "Awad", "Morcos"],
  },
  west_african: {
    male: ["Chukwuemeka", "Ifeanyi", "Emmanuel", "Joseph", "Augustine", "Francis", "Kofi", "Kwame", "Anthony", "Cyprian", "Peter", "Paul", "Ikechukwu", "Jean-Baptiste", "Boniface"],
    female: ["Ngozi", "Chiamaka", "Mary", "Grace", "Adaeze", "Comfort", "Josephine", "Ama", "Cecilia", "Agnes"],
    surnames: ["Okafor", "Eze", "Nwosu", "Okeke", "Obi", "Onyekachi", "Arinze", "Adeyemi", "Mensah", "Asante", "Boateng", "Ouédraogo", "Diallo", "Sarr", "Mendy", "Gomis", "Tine", "Dossou", "Nnamdi", "Onaiyekan"],
  },
  central_african: {
    male: ["Jean-Pierre", "Joseph", "Laurent", "Emmanuel", "Fidèle", "Augustin", "Dieudonné", "Célestin", "Patrice", "Gaston", "Marcel", "Fabrice", "Christian", "Déo", "Albert"],
    female: ["Marie", "Thérèse", "Béatrice", "Joséphine", "Clémentine", "Espérance", "Godelieve", "Chantal", "Pascaline", "Francine"],
    surnames: ["Mukendi", "Kabila", "Tshibanda", "Ilunga", "Kasongo", "Mbuyi", "Nkulu", "Lukusa", "Mutombo", "Kalala", "Ngoy", "Mboma", "Essomba", "Ngono", "Dos Santos"],
  },
  east_african: {
    male: ["Joseph", "Peter", "John", "Charles", "Kizito", "Matthias", "Anthony", "Stephen", "Francis", "Emmanuel", "Lwanga", "Gabriel", "Dominic", "Simon", "Bernard"],
    female: ["Mary", "Agnes", "Grace", "Josephine", "Margaret", "Florence", "Catherine", "Bakhita", "Teresa", "Annet"],
    surnames: ["Mwangi", "Otieno", "Kamau", "Wanjiru", "Ochieng", "Mutua", "Kiprono", "Ssekandi", "Mukasa", "Nakato", "Okello", "Kagame", "Uwimana", "Habimana", "Tesfaye"],
  },
  southern_african: {
    male: ["Sipho", "Thabo", "Joseph", "Benedict", "Mandla", "Peter", "Paul", "Tendai", "Rafael", "Jean", "Sibusiso", "Andile", "Francis", "Augustine", "Raymond"],
    female: ["Nomvula", "Thandiwe", "Mary", "Lindiwe", "Rudo", "Nyasha", "Rasoanirina", "Agnes", "Precious", "Monica"],
    surnames: ["Dlamini", "Nkosi", "Ndlovu", "Khumalo", "Mokoena", "Mahlangu", "Moyo", "Chikwanha", "Mutasa", "Rakotomalala", "Randrianarisoa", "Banda", "Phiri", "Mwale", "Sithole"],
  },
  south_asian: {
    male: ["Joseph", "Thomas", "Francis", "Anthony", "Xavier", "Sebastian", "George", "Mathew", "Joel", "Cyril", "Agnelo", "Rosario", "Benedict", "Jerome", "Ignatius"],
    female: ["Mary", "Teresa", "Alphonsa", "Lourdes", "Rosemary", "Anita", "Philomena", "Celine", "Agnes", "Fatima"],
    surnames: ["D'Souza", "Fernandes", "Pereira", "Rodrigues", "D'Costa", "Gonsalves", "Pinto", "Lobo", "Kurian", "Thomas", "Varghese", "Chacko", "Joseph", "Mascarenhas", "Gomes", "Rozario", "Gracias", "Coutinho", "Barretto", "Kallarakal"],
  },
  chinese: {
    male: ["Joseph", "Peter", "Paul", "John", "Matthew", "Francis", "Stephen", "Andrew", "Thomas", "Luke", "Ignatius", "Michael", "James", "Mark", "Anthony"],
    female: ["Mary", "Teresa", "Agnes", "Lucy", "Monica", "Cecilia", "Anna", "Rose", "Martha", "Bernadette"],
    surnames: ["Wang", "Li", "Zhang", "Liu", "Chen", "Yang", "Huang", "Zhao", "Wu", "Zhou", "Xu", "Sun", "Ma", "Zhu", "Hu", "Guo", "He", "Lin", "Luo", "Song"],
  },
  korean: {
    male: ["Andrew", "Paul", "Peter", "Thomas", "Francis", "Augustine", "Stephen", "Joseph", "Ignatius", "Lawrence", "John", "Michael", "Benedict", "Matthias", "Dominic"],
    female: ["Maria", "Agatha", "Columba", "Teresa", "Lucia", "Cecilia", "Barbara", "Monica", "Veronica", "Stella"],
    surnames: ["Kim", "Lee", "Park", "Choi", "Jung", "Kang", "Cho", "Yoon", "Jang", "Lim", "Han", "Oh", "Seo", "Shin", "Kwon"],
  },
  japanese: {
    male: ["Paulo", "Takeshi", "Kenji", "Francisco", "Yohane", "Petoro", "Hiroshi", "Makoto", "Daisuke", "Ryo", "Satoshi", "Mikaeru", "Tomasu", "Yosefu", "Kazuki"],
    female: ["Maria", "Yuki", "Haruka", "Megumi", "Akiko", "Teresa", "Kana", "Rina", "Ayumi", "Monika"],
    surnames: ["Nagai", "Takayama", "Urakami", "Miki", "Goto", "Sato", "Suzuki", "Takahashi", "Tanaka", "Watanabe", "Ito", "Yamamoto", "Nakamura", "Kobayashi", "Kato"],
  },
  vietnamese: {
    male: ["Phêrô", "Giuse", "Phaolô", "Gioan", "Anrê", "Đaminh", "Tôma", "Phanxicô", "Vinh Sơn", "Luca", "Matthêu", "Micae", "Antôn", "Giacôbê", "Stêphanô"],
    female: ["Maria", "Anna", "Têrêsa", "Agnes", "Cêcilia", "Lucia", "Monica", "Rosa", "Catarina", "Martha"],
    surnames: ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Phan", "Vũ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý", "Đinh"],
  },
  filipino: {
    male: ["Jose", "Juan", "Lorenzo", "Pedro", "Miguel", "Rafael", "Angelo", "Carlo", "Jericho", "Ramon", "Manuel", "Gabriel", "Paolo", "Ignacio", "Emmanuel"],
    female: ["Maria", "Rosario", "Clarissa", "Angelica", "Teresita", "Josefina", "Corazon", "Lourdes", "Divina", "Imelda"],
    surnames: ["Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Garcia", "Mendoza", "Torres", "Tomas", "Villanueva", "Ramos", "Aquino", "Dela Cruz", "Castillo", "Navarro", "Pascual", "Soriano", "Manalo", "Salazar", "Ruiz"],
  },
  indonesian: {
    male: ["Yohanes", "Petrus", "Paulus", "Fransiskus", "Antonius", "Yosef", "Stefanus", "Agustinus", "Ignatius", "Benediktus", "Markus", "Dominikus", "Albertus", "Thomas", "Gregorius"],
    female: ["Maria", "Theresia", "Agnes", "Katarina", "Lusia", "Monika", "Yuliana", "Veronika", "Fransiska", "Bernadeta"],
    surnames: ["Sinaga", "Siregar", "Nainggolan", "Simanjuntak", "Lewuk", "Djawa", "Nggole", "Wiryawan", "Susanto", "Hadi", "Pareira", "Da Costa", "Ximenes", "Belo", "Guterres"],
  },
  anglo: {
    male: ["Michael", "Joseph", "John", "Thomas", "Patrick", "Daniel", "Matthew", "James", "Anthony", "Paul", "Christopher", "Vincent", "Gregory", "Dominic", "Luke"],
    female: ["Mary", "Catherine", "Elizabeth", "Theresa", "Clare", "Anne", "Margaret", "Rose", "Frances", "Bernadette"],
    surnames: ["Sullivan", "Kowalski", "Russo", "Murphy", "Schmidt", "Kennedy", "O'Malley", "Bianchi", "Novak", "Walsh", "McDonnell", "Brennan", "Costello", "Fitzpatrick", "Gallagher", "Hogan", "Mancuso", "Lombardi", "Nguyen", "Mackenzie"],
  },
  hispanic: {
    male: ["José", "Juan", "Jesús", "Miguel", "Francisco", "Guadalupe", "Luis", "Carlos", "Alejandro", "Rafael", "Ignacio", "Martín", "Óscar", "Joaquín", "Felipe"],
    female: ["María", "Guadalupe", "Rosa", "Carmen", "Dolores", "Lucía", "Teresa", "Ana", "Socorro", "Esperanza"],
    surnames: ["Hernández", "García", "Martínez", "López", "González", "Rodríguez", "Pérez", "Sánchez", "Ramírez", "Flores", "Romero", "Morales", "Castillo", "Ortiz", "Gutiérrez", "Chávez", "Mendoza", "Vargas", "Quispe", "Mamani"],
  },
  brazilian: {
    male: ["João", "José", "Francisco", "Antônio", "Pedro", "Paulo", "Lucas", "Gabriel", "Rafael", "Mateus", "Tiago", "Bento", "Inácio", "Sebastião", "Aparecido"],
    female: ["Maria", "Ana", "Francisca", "Antônia", "Aparecida", "Teresa", "Luzia", "Rita", "Clara", "Dulce"],
    surnames: ["Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes", "Costa", "Ribeiro", "Martins", "Carvalho", "Araújo", "Barbosa", "Rocha", "Cardoso", "Nascimento", "Teixeira"],
  },
} satisfies Record<string, Culture>;

export type CultureId = keyof typeof CULTURES;

interface RegionRecruiting {
  /** Rough Catholic presence: how many recruits the Church network can find here. */
  presence: number;
  /** Which name cultures recruits from this region come from, with weights. */
  cultures: Partial<Record<CultureId, number>>;
}

export const REGION_RECRUITING: Record<string, RegionRecruiting> = {
  italy: { presence: 1.8, cultures: { italian: 1 } },
  iberia: { presence: 2, cultures: { iberian: 1 } },
  france_benelux: { presence: 1.5, cultures: { french: 1 } },
  british_isles: { presence: 1, cultures: { irish: 0.7, anglo: 0.3 } },
  germany_alps: { presence: 1.2, cultures: { german: 0.85, italian: 0.15 } },
  central_europe: { presence: 2, cultures: { polish: 0.6, central: 0.4 } },
  balkans: { presence: 0.6, cultures: { balkan: 1 } },
  nordic: { presence: 0.2, cultures: { nordic: 0.6, polish: 0.4 } },
  eastern_europe: { presence: 0.8, cultures: { ukrainian_baltic: 0.85, polish: 0.15 } },
  russia_west: { presence: 0.15, cultures: { russian: 1 } },
  russia_volga: { presence: 0.1, cultures: { russian: 0.8, armenian_caucasian: 0.2 } },
  urals: { presence: 0.1, cultures: { russian: 1 } },
  north_siberia: { presence: 0.1, cultures: { russian: 0.8, polish: 0.2 } },
  south_siberia: { presence: 0.15, cultures: { russian: 0.7, polish: 0.15, german: 0.15 } },
  russia_far_east: { presence: 0.1, cultures: { russian: 0.7, korean: 0.3 } },
  central_asia: { presence: 0.1, cultures: { central_asian: 1 } },
  turkey_caucasus: { presence: 0.15, cultures: { armenian_caucasian: 0.8, levantine: 0.2 } },
  levant: { presence: 0.6, cultures: { levantine: 1 } },
  arabia: { presence: 0.3, cultures: { filipino: 0.5, south_asian: 0.3, levantine: 0.2 } },
  iran: { presence: 0.05, cultures: { levantine: 0.6, armenian_caucasian: 0.4 } },
  maghreb: { presence: 0.05, cultures: { west_african: 0.5, french: 0.3, levantine: 0.2 } },
  nile: { presence: 0.25, cultures: { coptic: 0.8, east_african: 0.2 } },
  west_africa: { presence: 1.5, cultures: { west_african: 1 } },
  central_africa: { presence: 2, cultures: { central_african: 1 } },
  east_africa: { presence: 1.5, cultures: { east_african: 1 } },
  southern_africa: { presence: 1, cultures: { southern_african: 1 } },
  south_asia: { presence: 0.8, cultures: { south_asian: 1 } },
  north_china: { presence: 0.6, cultures: { chinese: 1 } },
  south_china: { presence: 0.6, cultures: { chinese: 1 } },
  west_china: { presence: 0.3, cultures: { chinese: 1 } },
  japan_korea: { presence: 0.8, cultures: { korean: 0.6, japanese: 0.25, chinese: 0.15 } },
  se_asia: { presence: 0.8, cultures: { vietnamese: 0.75, chinese: 0.25 } },
  maritime_asia: { presence: 2.5, cultures: { filipino: 0.65, indonesian: 0.35 } },
  australia_east: { presence: 1, cultures: { irish: 0.5, anglo: 0.3, italian: 0.1, vietnamese: 0.1 } },
  australia_west: { presence: 0.8, cultures: { irish: 0.5, anglo: 0.4, italian: 0.1 } },
  pacific: { presence: 0.8, cultures: { irish: 0.5, anglo: 0.3, filipino: 0.2 } },
  canada_east: { presence: 1.2, cultures: { french: 0.55, anglo: 0.3, irish: 0.15 } },
  canada_west: { presence: 0.8, cultures: { anglo: 0.6, filipino: 0.2, irish: 0.2 } },
  us_northeast: { presence: 1.2, cultures: { anglo: 0.55, irish: 0.25, hispanic: 0.2 } },
  us_south: { presence: 0.8, cultures: { anglo: 0.45, hispanic: 0.45, vietnamese: 0.1 } },
  us_midwest: { presence: 1, cultures: { anglo: 0.6, polish: 0.2, hispanic: 0.2 } },
  us_west: { presence: 0.9, cultures: { hispanic: 0.5, anglo: 0.35, filipino: 0.15 } },
  mexico_central: { presence: 3, cultures: { hispanic: 1 } },
  caribbean: { presence: 1, cultures: { hispanic: 0.7, french: 0.3 } },
  andean_north: { presence: 2.5, cultures: { hispanic: 1 } },
  brazil: { presence: 3, cultures: { brazilian: 1 } },
  andes_south: { presence: 2, cultures: { hispanic: 1 } },
  southern_cone: { presence: 2, cultures: { hispanic: 0.75, italian: 0.25 } },
};
