# AhoyDTU

Suivez vos **micro-onduleurs Hoymiles** dans Gladys grâce à
[AhoyDTU](https://github.com/lumapu/ahoy), le firmware libre pour cartes
ESP8266 et ESP32 qui dialogue par radio avec les onduleurs. Tout reste sur
votre réseau local : ni cloud Hoymiles, ni compte.

> **Développée sans le matériel : vos retours sont les bienvenus.** Cette
> intégration a été écrite à partir du code source d'AhoyDTU 0.8 et testée
> contre une simulation fidèle de son API, pas contre une vraie DTU. Si
> quelque chose cloche, dites-le sur le forum Gladys ou dans une issue GitHub.

## Présentation

- Un appareil Gladys par onduleur configuré dans l'AhoyDTU (séries HM, HMS,
  HMT).
- Puissance AC en direct, production du jour, production totale, tension
  réseau et température, plus la puissance et la production du jour de chaque
  panneau.
- Une fonctionnalité « Joignable » et un texte « État » qui distinguent la
  nuit (l'onduleur dort, c'est normal) d'une vraie perte.
- Deux déclencheurs de scène : un onduleur qui ne répond plus en journée, et
  la première production de la journée.
- Une limite de puissance temporaire, en action et en action de scène,
  **désactivée par défaut**.
- Un widget « AhoyDTU » pour le tableau de bord.

Vous utilisez OpenDTU plutôt qu'AhoyDTU ? Installez plutôt l'intégration
**Hoymiles (OpenDTU)** du store : elle lit les mêmes onduleurs via OpenDTU.

## Prérequis

- Une AhoyDTU en firmware **0.8** (testée contre la 0.8.155), sur le même
  réseau que Gladys, avec ses onduleurs déjà configurés (Settings > Inverter).
- Son adresse IP : affichée sur son écran si elle en a un, dans votre box, ou
  dans la page System de l'AhoyDTU. Une adresse fixe (réservation DHCP) est
  recommandée.
- Gladys 5.1 ou plus récent.

Pour que la nuit soit détectée exactement, saisissez les coordonnées de votre
installation dans l'AhoyDTU (Settings > Sunrise & Sunset) : elle donne alors
les heures de lever et de coucher du soleil. Sans elles, l'intégration
fonctionne quand même et se fie à la façon dont l'onduleur s'est tu (voir
« Nuit et jour »).

## Configuration

- **Adresse IP** : l'adresse de votre AhoyDTU, par ex. `192.168.1.50`. Un nom
  d'hôte convient aussi.
- **Mot de passe administrateur** : seulement si l'AhoyDTU en a un (System >
  Protection) et que vous voulez utiliser la limite de puissance. La lecture
  des valeurs n'en demande pas.
- **Intervalle de rafraîchissement** : 10, 15 (par défaut), 30 ou 60
  secondes. L'AhoyDTU interroge elle-même les onduleurs toutes les 15
  secondes par défaut : la lire plus souvent n'apporte rien.
- **Autoriser la limite de puissance** : désactivé par défaut. Tant qu'il
  l'est, rien n'est jamais envoyé aux onduleurs.
- **Langue des textes** : noms donnés aux nouveaux appareils et
  fonctionnalités, textes d'état et messages des actions. Français par défaut.

Cliquez ensuite sur **Tester la connexion**, ouvrez l'onglet **Découverte** et
ajoutez vos onduleurs.

## Appareils

Chaque onduleur devient un appareil nommé comme dans l'AhoyDTU (ou
« Onduleur » suivi de son numéro de série s'il n'a pas de nom). Ses
fonctionnalités :

| Fonctionnalité       | Unité | Remarques                                           |
| -------------------- | ----- | --------------------------------------------------- |
| Puissance            | W     | puissance AC injectée dans la maison                |
| Production du jour   | kWh   | revient à 0 après minuit                            |
| Production totale    | kWh   | index cumulé, jamais remis à zéro                   |
| Tension réseau       | V     |                                                     |
| Température          | °C    | de l'onduleur                                       |
| Joignable            | 0/1   | 1 quand l'onduleur répond à la radio                |
| État                 | texte | en production, éveillé, en veille (nuit)…           |
| Puissance panneau N  | W     | une par entrée DC, avec le nom de panneau d'AhoyDTU |
| Production panneau N | kWh   | production du jour, une par entrée DC               |

Les noms sont figés à la création de l'appareil : renommez-les dans Gladys si
vous le souhaitez.

## Nuit et jour

Un onduleur Hoymiles est alimenté par ses panneaux : au crépuscule, il cesse
de répondre, et l'AhoyDTU le marque indisponible cinq minutes plus tard.
L'intégration ne prend pas cela pour une panne :

- un onduleur dont la puissance était déjà passée sous 10 W avant de se taire
  est **en veille**, quelle que soit l'heure (hiver, ombre, panneaux à l'est) ;
- avec les heures de lever et de coucher du soleil de l'AhoyDTU, un onduleur
  perdu la nuit ou à moins de 90 minutes du lever ou du coucher est aussi en
  veille ;
- seul un onduleur coupé en pleine production, en plein jour, **ne répond
  pas**.

La nuit, la puissance vaut 0 W, l'État indique « En veille (nuit) » et la
production totale garde sa valeur. La production du jour revient à 0 après
minuit, même si l'onduleur dort encore. La nuit, l'intégration lit l'AhoyDTU
une fois par intervalle, sans demander les valeurs des onduleurs endormis.

## Widget

Le widget **AhoyDTU** affiche la production instantanée et du jour, une
courbe sur 24 heures et l'état de chaque onduleur (avec sa limite de
puissance quand il en a une). Avec un seul onduleur ajouté à Gladys, les
tuiles suivent ses fonctionnalités en direct ; avec plusieurs, elles
affichent les sommes. La courbe et les lignes des onduleurs se masquent dans
les réglages du widget.

## Déclencheurs de scène

- **Onduleur Hoymiles injoignable** : un onduleur ne répond plus en journée,
  ou l'AhoyDTU elle-même ne répond plus (variable `cause` : `inverter` ou
  `dtu`). Jamais la nuit. Au plus un événement toutes les 10 minutes par
  onduleur.
- **Production Hoymiles démarrée** : un onduleur produit pour la première
  fois de la journée (réveil du matin), une fois par jour. Pratique pour
  lancer une machine à laver au soleil.

Les deux peuvent être limités à un onduleur et donnent son nom (`inverter`) à
la scène. Pour « puissance au-dessus de X W », utilisez le déclencheur
standard d'appareil sur la fonctionnalité Puissance : il a le seuil et la
durée.

## Limite de puissance

Disponible comme action de l'intégration (**Limiter la puissance**) et comme
action de scène, une fois **Autoriser la limite de puissance** activé.
Choisissez l'onduleur et une limite de 2 à 100 % de sa puissance nominale ;
100 % lève la limite.

La limite est envoyée **non persistante** : elle n'est pas écrite dans la
mémoire de l'onduleur et se perd quand il redémarre, ce qui arrive chaque
matin. Elle sert aux scènes (zéro injection quand le prix est négatif, par
exemple), pas de réglage permanent. L'intégration la refuse dès que
l'AhoyDTU indique l'onduleur indisponible (la nuit, par exemple).

## Exemples de scènes

- Quand « Onduleur Hoymiles injoignable » se déclenche avec la cause
  `inverter`, envoyer un message : un disjoncteur a peut-être sauté.
- Quand « Production Hoymiles démarrée », lancer le lave-vaisselle.
- Quand le prix du réseau devient négatif, limiter la puissance à 2 % ; la
  remettre à 100 % quand il redevient positif.

## Dépannage

- **« L'AhoyDTU ne répond pas »** : vérifiez l'adresse, que la carte est
  alimentée et sur le même réseau. Le message donne l'erreur réseau.
- **Aucun appareil dans Découverte** : les onduleurs doivent être configurés
  dans l'AhoyDTU (Settings > Inverter). Cliquez sur **Tester la connexion** :
  elle indique combien d'onduleurs l'AhoyDTU gère.
- **« Ne répond pas » alors qu'il fait nuit** : saisissez les coordonnées
  dans l'AhoyDTU pour qu'elle connaisse les heures du soleil, et
  signalez-le sur le forum (avec la puissance avant la perte).
- **« L'AhoyDTU a refusé le mot de passe »** / **« protégée par un mot de
  passe »** : saisissez le mot de passe administrateur de l'AhoyDTU dans la
  configuration.
- **La limite est refusée la nuit** : normal, l'onduleur dort.
- Passez le niveau de journalisation en debug dans Gladys pour voir chaque
  requête.

## Limites

- Développée sans le matériel, contre une simulation de l'API d'AhoyDTU 0.8 :
  vos retours sont les bienvenus.
- Les AhoyDTU 0.7 et antérieures ne sont pas testées. Le MQTT n'est pas
  utilisé : seulement l'API REST.
- Seule la limite relative non persistante est proposée ; ni marche/arrêt, ni
  redémarrage, ni limite persistante (elle use la mémoire de l'onduleur).
- Pas de fonctionnalités fréquence, courant ou rendement.
- Les valeurs de production sont celles de l'onduleur : elles peuvent
  légèrement différer de celles d'un compteur.

## Données et réseau

- L'intégration ne parle qu'à l'adresse saisie, en HTTP simple (le seul
  protocole de l'AhoyDTU), sur votre réseau local. Rien ne sort de chez vous.
- Elle garde dans son volume `/data` la liste des onduleurs (numéros de série,
  noms, noms des panneaux), pour les retrouver après un redémarrage. Le mot de
  passe reste dans la configuration de Gladys et n'est jamais écrit dans un
  journal.
- Sans lien avec Hoymiles ni avec le projet AhoyDTU.
