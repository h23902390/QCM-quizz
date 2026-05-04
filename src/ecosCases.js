// Banque de cas ECOS embarquée
export const ECOS_CASES = [
  {
    id: 'ecos-douleur-thoracique',
    titre: 'Douleur thoracique aiguë',
    specialite: 'Cardiologie / Urgences',
    duree: 10,
    consigneCandidat: `**Contexte** : Vous êtes interne aux urgences. Un homme de 58 ans se présente pour une douleur thoracique apparue il y a 2 heures.

**Mission** :
- Réaliser l'interrogatoire et l'examen physique orienté
- Évoquer les diagnostics différentiels
- Proposer une prise en charge initiale
- Communiquer clairement avec le patient

**Durée** : 10 minutes`,
    briefPatient: `Tu joues M. Dupont, 58 ans, comptable, qui consulte aux urgences. Réponds UNIQUEMENT en tant que patient, jamais en tant qu'examinateur. Reste naturel, parfois angoissé, parle simplement. Ne révèle les informations QUE si on te les demande explicitement (sauf le motif spontané).

DOSSIER (à révéler progressivement selon questions) :
- Motif spontané : "J'ai très mal dans la poitrine depuis 2 heures, ça serre, je suis inquiet."
- Douleur : rétrosternale, constrictive ("comme un étau"), 8/10, irradie vers le bras gauche et la mâchoire, début brutal au repos il y a 2h, continue, accompagnée de sueurs et nausées légères, non soulagée par le repos.
- ATCD : HTA traitée par amlodipine 5mg, dyslipidémie sous atorvastatine 20mg, tabagisme 30 PA actif.
- ATCD familiaux : père décédé d'IDM à 62 ans.
- Allergies : aucune.
- Mode de vie : marié, 2 enfants, sédentaire, alcool occasionnel.
- Pas de fièvre, pas de toux, pas de dyspnée majeure (juste un peu essoufflé à cause de l'angoisse).
- Pas de traumatisme, pas de voyage récent, pas d'immobilisation.
- Si on te demande tes constantes : tu ne les connais pas, c'est l'examinateur qui les prend.

Si on t'examine : laisse-toi faire et décris ce que tu ressens si on te questionne. Si on te rassure ou t'explique, réagis de manière humaine. Ne donne JAMAIS le diagnostic toi-même.`,
    grilleCorrection: [
      { section: 'Présentation', critere: 'Se présente, vérifie identité, hygiène des mains', points: 1 },
      { section: 'Motif', critere: 'Identifie clairement le motif de consultation', points: 1 },
      { section: 'Anamnèse douleur', critere: 'Caractérise la douleur (siège, type, intensité, irradiation, durée, facteurs)', points: 3 },
      { section: 'ATCD', critere: 'Recherche ATCD personnels et familiaux cardiovasculaires', points: 2 },
      { section: 'Traitements/Allergies', critere: 'Demande traitements en cours et allergies', points: 1 },
      { section: 'Mode de vie', critere: 'Recherche FdR (tabac, sédentarité, alcool)', points: 2 },
      { section: 'Examen physique', critere: 'Demande constantes, ausculte cœur/poumons, palpe pouls', points: 2 },
      { section: 'Diagnostics', critere: 'Évoque SCA en priorité + différentiels (EP, dissection, péricardite)', points: 3 },
      { section: 'Examens complémentaires', critere: 'ECG immédiat, troponine, NFS, iono, RxT', points: 2 },
      { section: 'Prise en charge', critere: 'Aspirine, antalgie, voie veineuse, scope, appel cardio/USIC', points: 2 },
      { section: 'Communication', critere: 'Empathie, explications claires, rassure le patient', points: 1 },
    ],
  },
  {
    id: 'ecos-cephalees',
    titre: 'Céphalées aiguës fébriles',
    specialite: 'Neurologie / Infectiologie',
    duree: 10,
    consigneCandidat: `**Contexte** : Vous êtes médecin aux urgences. Une femme de 24 ans consulte pour des céphalées intenses depuis 24 heures.

**Mission** :
- Mener l'interrogatoire et l'examen
- Hiérarchiser les hypothèses diagnostiques
- Proposer la prise en charge

**Durée** : 10 minutes`,
    briefPatient: `Tu joues Mme Martin, 24 ans, étudiante. Tu es prostrée, tu parles doucement, tu plisses les yeux car la lumière te gêne. Réponds en patient, jamais en examinateur. Ne révèle les infos que si on te les demande.

DOSSIER :
- Motif spontané : "J'ai un mal de tête horrible depuis hier, je ne supporte plus la lumière."
- Céphalées : diffuses, intenses (9/10), continues, début progressif sur 12h, non soulagées par paracétamol.
- Fièvre : 39°C mesurée ce matin, frissons.
- Photophobie marquée, phonophobie.
- Nausées et un vomissement.
- Raideur de nuque (si on teste : douloureux de fléchir le cou).
- Pas d'ATCD particuliers, pas de migraines connues.
- Pas de traumatisme. Pas de voyage. Vit en colocation, étudiante en fac.
- Aucun traitement, pas d'allergie, pas de toxique.
- Pas de déficit moteur ressenti, pas de troubles visuels en dehors de la photophobie.
- Si on demande purpura : "j'ai vu quelques petits points rouges sur mes jambes ce matin" (à révéler seulement si on demande).

Ne donne pas le diagnostic. Sois inquiète mais coopérante.`,
    grilleCorrection: [
      { section: 'Présentation', critere: 'Présentation, identité, hygiène des mains', points: 1 },
      { section: 'Motif', critere: 'Recueil clair du motif', points: 1 },
      { section: 'Anamnèse céphalée', critere: 'Caractérise la céphalée (mode début, intensité, type, signes accompagnement)', points: 3 },
      { section: 'Signes infectieux', critere: 'Recherche fièvre, frissons, syndrome méningé', points: 2 },
      { section: 'ATCD/contage', critere: 'ATCD, vaccination, voyage, contage', points: 1 },
      { section: 'Examen neuro', critere: 'Raideur nuque, Kernig/Brudzinski, conscience, focal', points: 3 },
      { section: 'Examen cutané', critere: 'Recherche purpura (déshabille la patiente)', points: 2 },
      { section: 'Diagnostics', critere: 'Méningite bactérienne en priorité, méningo-encéphalite, HSA, migraine', points: 3 },
      { section: 'Examens complémentaires', critere: 'PL après TDM si signes de focalisation, hémocultures, NFS, CRP', points: 2 },
      { section: 'Prise en charge', critere: 'ATB probabiliste urgente (C3G ± dexa) si purpura, isolement', points: 1 },
      { section: 'Communication', critere: 'Empathie, explication, gestion de l\'urgence', points: 1 },
    ],
  },
  {
    id: 'ecos-dyspnee',
    titre: 'Dyspnée aiguë',
    specialite: 'Pneumologie / Cardiologie',
    duree: 10,
    consigneCandidat: `**Contexte** : Femme de 72 ans amenée aux urgences pour dyspnée d'apparition rapide depuis quelques heures.

**Mission** :
- Anamnèse + examen orientés
- Hypothèses diagnostiques hiérarchisées
- Prise en charge initiale

**Durée** : 10 minutes`,
    briefPatient: `Tu joues Mme Bernard, 72 ans, retraitée. Tu es essoufflée, tu parles par phrases courtes. Patiente uniquement, pas examinatrice.

DOSSIER :
- Motif : "Je n'arrive plus à respirer depuis ce matin… ça s'aggrave."
- Dyspnée : début progressif sur 6h, aggravée en décubitus (orthopnée, dort avec 3 oreillers depuis 2 jours), pas de douleur thoracique nette mais oppression.
- Toux avec expectoration mousseuse rosée la nuit dernière.
- Œdèmes des chevilles depuis 1 semaine, prise de 3 kg.
- ATCD : HTA, fibrillation auriculaire sous AOD (apixaban), insuffisance cardiaque connue (FEVG 35%), diabète type 2.
- Traitements : apixaban, bisoprolol, furosémide 40mg (mais avoue avoir oublié plusieurs doses cette semaine), metformine, IEC.
- Pas d'allergie. Ex-tabagique 20 PA arrêté à 50 ans.
- Pas de voyage, pas d'alitement récent, pas de douleur de mollet.
- Pas de fièvre.
- Si on te demande douleur thoracique : non, juste oppression.

Réponds simplement, ne propose pas le diagnostic.`,
    grilleCorrection: [
      { section: 'Présentation', critere: 'Se présente, identité, hygiène mains', points: 1 },
      { section: 'Motif', critere: 'Recueil du motif', points: 1 },
      { section: 'Anamnèse dyspnée', critere: 'Mode début, NYHA, orthopnée, DPN, expectoration', points: 3 },
      { section: 'Signes associés', critere: 'Œdèmes, prise poids, douleur thoracique, mollets', points: 2 },
      { section: 'ATCD', critere: 'IC, FA, HTA, diabète', points: 2 },
      { section: 'Traitements/observance', critere: 'Médicaments + observance + anticoagulant', points: 2 },
      { section: 'Examen physique', critere: 'Constantes/SpO2, auscultation crépitants, OMI, TJ', points: 2 },
      { section: 'Diagnostics', critere: 'OAP en priorité, EP, pneumopathie, BPCO décompensée', points: 3 },
      { section: 'Examens complémentaires', critere: 'ECG, BNP, troponine, GDS, RxT, écho si dispo', points: 2 },
      { section: 'Prise en charge', critere: 'O2, position assise, dérivés nitrés, furosémide IV, VNI si besoin', points: 1 },
      { section: 'Communication', critere: 'Rassure, explique', points: 1 },
    ],
  },
  {
    id: 'ecos-douleur-abdominale',
    titre: 'Douleur abdominale fosse iliaque droite',
    specialite: 'Chirurgie digestive',
    duree: 10,
    consigneCandidat: `**Contexte** : Homme de 22 ans aux urgences pour douleur abdominale depuis 18 heures.

**Mission** :
- Anamnèse + examen
- Diagnostics + différentiels
- Prise en charge

**Durée** : 10 minutes`,
    briefPatient: `Tu joues M. Lefèvre, 22 ans, étudiant. Tu as mal au ventre, tu marches courbé. Patient uniquement.

DOSSIER :
- Motif : "J'ai mal au ventre depuis hier soir, ça empire."
- Douleur : début péri-ombilical hier soir, migrée en fosse iliaque droite ce matin, continue, 7/10, aggravée par la marche et la toux.
- Anorexie depuis hier soir, une nausée, un vomissement alimentaire ce matin.
- Fièvre 38.3°C ce matin.
- Pas de diarrhée, pas de constipation, dernier transit normal ce matin.
- Pas de symptômes urinaires (pas de brûlures, pas d'hématurie).
- ATCD : aucun, pas opéré, pas d'allergie, aucun traitement.
- Mode de vie : étudiant, pas de tabac, alcool festif, pas de drogue.
- Pas de voyage récent. Pas de partenaires sexuels récents à risque.
- Si on demande Mc Burney : "oui c'est très douloureux là".
- Si défense : oui légère défense FID si bien examiné.

Coopératif mais souffrant.`,
    grilleCorrection: [
      { section: 'Présentation', critere: 'Présentation, identité, hygiène mains', points: 1 },
      { section: 'Motif', critere: 'Recueil clair du motif', points: 1 },
      { section: 'Anamnèse douleur', critere: 'Siège, irradiation, type, intensité, chronologie, migration', points: 3 },
      { section: 'Signes digestifs', critere: 'Anorexie, nausées, vomissements, transit', points: 2 },
      { section: 'Signes généraux/urinaires', critere: 'Fièvre, signes urinaires, génitaux', points: 2 },
      { section: 'ATCD/Mode de vie', critere: 'ATCD chirurgicaux, allergies, traitements, sexualité', points: 1 },
      { section: 'Examen physique', critere: 'Constantes, palpation, McBurney, défense, TR, BU', points: 3 },
      { section: 'Diagnostics', critere: 'Appendicite aiguë + différentiels (adénolymphite, torsion testic, Crohn)', points: 3 },
      { section: 'Examens complémentaires', critere: 'NFS, CRP, BU, β-HCG si femme, écho/TDM', points: 2 },
      { section: 'Prise en charge', critere: 'À jeun, voie veineuse, antalgie, avis chirurgical', points: 1 },
      { section: 'Communication', critere: 'Empathie, explications', points: 1 },
    ],
  },
];
