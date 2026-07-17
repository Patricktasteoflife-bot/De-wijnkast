# Android / Google Play

Deze map bevat de Trusted Web Activity-versie van **De Wijnkast van Taste of Life**.

## Vaste configuratie

- Webapp: `https://de-wijnkast-v2.pages.dev`
- Definitieve package-ID: `nl.tasteoflife.dewijnkast`
- Minimum Android-versie: API 23 (Android 6)
- Compile- en targetniveau: API 36
- Build Tools: 36.0.0
- Java: JDK 17
- Bubblewrap: 1.24.1

De package-ID is door de eigenaar bevestigd. Na de eerste upload kan deze identiteit niet meer worden gewijzigd.

## Veilig bouwen

De uploadkeystore en wachtwoorden horen nooit in Git of in deze openbare repository. `.gitignore` sluit de lokale map `play-signing/` en alle Android-keystorebestanden uit.

Na plaatsing van een lokale keystore op het pad uit `twa-manifest.json`:

```bash
bubblewrap build --skipPwaValidation
```

Voor de definitieve Trusted Web Activity moet `/.well-known/assetlinks.json` zowel de SHA-256-vingerafdruk van de uploadtest als de **Play app-signing certificate**-vingerafdruk bevatten. De Play-vingerafdruk is pas beschikbaar nadat Play App Signing is geactiveerd.
