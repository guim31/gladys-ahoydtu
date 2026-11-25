# AhoyDTU

Siga sus **microinversores Hoymiles** en Gladys mediante
[AhoyDTU](https://github.com/lumapu/ahoy), el firmware libre para placas
ESP8266 y ESP32 que se comunica por radio con los inversores. Todo se queda
en su red local: sin nube de Hoymiles, sin cuenta.

> **Desarrollada sin el hardware: sus comentarios son bienvenidos.** Esta
> integración se escribió a partir del código fuente de AhoyDTU 0.8 y se
> probó contra una simulación fiel de su API, no contra una DTU real. Si algo
> no funciona bien, dígalo en el foro de Gladys o en un issue de GitHub.

## Presentación

- Un dispositivo Gladys por inversor configurado en AhoyDTU (series HM, HMS,
  HMT).
- Potencia AC en directo, producción de hoy, producción total, tensión de red
  y temperatura, además de la potencia y la producción de hoy de cada panel.
- Una función «Accesible» y un texto «Estado» que distinguen la noche (el
  inversor duerme, es normal) de una pérdida real.
- Dos desencadenantes de escena: un inversor que deja de responder de día, y
  la primera producción del día.
- Un límite de potencia temporal, como acción y como acción de escena,
  **desactivado por defecto**.
- Un widget «AhoyDTU» para el panel de control.

¿Utiliza OpenDTU en lugar de AhoyDTU? Instale en su lugar la integración
**Hoymiles (OpenDTU)** del store: lee los mismos inversores mediante OpenDTU.

## Requisitos

- Una AhoyDTU con firmware **0.8** (probada contra la 0.8.155), en la misma
  red que Gladys, con sus inversores ya configurados (Settings > Inverter).
- Su dirección IP: en su pantalla si tiene una, en su router o en la página
  System de AhoyDTU. Se recomienda una dirección fija (reserva DHCP).
- Gladys 5.1 o posterior.

Para que la noche se detecte con exactitud, introduzca las coordenadas de su
instalación en AhoyDTU (Settings > Sunrise & Sunset): entonces da las horas de
salida y puesta del sol. Sin ellas, la integración funciona igualmente y se
basa en cómo el inversor se quedó en silencio (vea «Noche y día»).

## Configuración

- **Dirección IP**: la dirección de su AhoyDTU, p. ej. `192.168.1.50`. También
  sirve un nombre de host.
- **Contraseña de administrador**: solo si AhoyDTU tiene una (System >
  Protection) y usted quiere utilizar el límite de potencia. La lectura de los
  valores no la necesita.
- **Intervalo de actualización**: 10, 15 (por defecto), 30 o 60 segundos.
  AhoyDTU consulta los inversores cada 15 segundos por defecto: leerla más a
  menudo no aporta nada.
- **Permitir el límite de potencia**: desactivado por defecto. Mientras lo
  esté, nunca se envía nada a los inversores.
- **Idioma de los textos**: nombres de los nuevos dispositivos y funciones,
  textos de estado y mensajes de las acciones. Francés por defecto.

Después haga clic en **Probar conexión**, abra la pestaña **Descubrir** y
añada sus inversores.

## Dispositivos

Cada inversor se convierte en un dispositivo con su nombre de AhoyDTU (o
«Inversor» y su número de serie si no tiene nombre). Sus funciones:

| Función            | Unidad | Notas                                              |
| ------------------ | ------ | -------------------------------------------------- |
| Potencia           | W      | potencia AC inyectada en la casa                   |
| Producción de hoy  | kWh    | vuelve a 0 después de medianoche                   |
| Producción total   | kWh    | índice acumulado, nunca se pone a cero             |
| Tensión de red     | V      |                                                    |
| Temperatura        | °C     | del inversor                                       |
| Accesible          | 0/1    | 1 cuando el inversor responde por radio            |
| Estado             | texto  | produciendo, activo, en reposo (noche)…            |
| Potencia panel N   | W      | una por entrada DC, con el nombre de panel de Ahoy |
| Producción panel N | kWh    | producción de hoy, una por entrada DC              |

Los nombres se fijan al crear el dispositivo: cámbielos en Gladys si lo
desea.

## Noche y día

Un inversor Hoymiles se alimenta de sus paneles: al anochecer deja de
responder, y AhoyDTU lo marca como no disponible cinco minutos después. La
integración no lo considera una avería:

- con las horas de salida y puesta del sol de AhoyDTU, un inversor perdido
  después de la puesta del sol está **en reposo**;
- sin ellas, un inversor cuya potencia ya había bajado a 0 W antes de
  quedarse en silencio está en reposo, mientras que uno cortado en plena
  producción **no responde**.

De noche la potencia es 0 W, el Estado indica «En reposo (noche)» y la
producción total conserva su valor. La producción de hoy vuelve a 0 después
de medianoche, aunque el inversor siga dormido. De noche, la integración lee
AhoyDTU una vez por intervalo, sin pedir los valores de los inversores
dormidos.

## Widget

El widget **AhoyDTU** muestra la producción actual y de hoy, un gráfico de 24
horas y el estado de cada inversor (con su límite de potencia si tiene uno).
Con un solo inversor añadido a Gladys, los mosaicos siguen sus funciones en
directo; con varios, muestran las sumas. El gráfico y las líneas de los
inversores se pueden ocultar en los ajustes del widget.

## Desencadenantes de escena

- **Inversor Hoymiles sin respuesta**: un inversor ha dejado de responder de
  día, o la propia AhoyDTU (variable `cause`: `inverter` o `dtu`). Nunca de
  noche. Como máximo un evento cada 10 minutos por inversor.
- **Producción Hoymiles iniciada**: un inversor produce por primera vez en el
  día (despertar de la mañana), una vez al día. Útil para poner en marcha una
  lavadora con energía solar.

Ambos pueden limitarse a un inversor y pasan su nombre (`inverter`) a la
escena. Para «potencia por encima de X W», use el desencadenante estándar de
dispositivo sobre la función Potencia: tiene el umbral y la duración.

## Límite de potencia

Disponible como acción de la integración (**Limitar la potencia**) y como
acción de escena, una vez activado **Permitir el límite de potencia**. Elija
el inversor y un límite de 2 a 100 % de su potencia nominal; 100 % elimina el
límite.

El límite se envía **no persistente**: no se escribe en la memoria del
inversor y se pierde cuando este se reinicia, lo que ocurre cada mañana.
Está pensado para escenas (inyección cero cuando el precio es negativo, por
ejemplo), no como ajuste permanente. AhoyDTU lo rechaza de noche, cuando el
inversor no responde.

## Ejemplos de escenas

- Cuando «Inversor Hoymiles sin respuesta» se active con la causa `inverter`,
  enviar un mensaje: quizá ha saltado un disyuntor.
- Cuando «Producción Hoymiles iniciada», poner en marcha el lavavajillas.
- Cuando el precio de la red sea negativo, limitar la potencia al 2 %;
  volver al 100 % cuando sea positivo.

## Solución de problemas

- **«AhoyDTU no responde»**: compruebe la dirección, que la placa esté
  encendida y en la misma red. El mensaje indica el error de red.
- **Ningún dispositivo en Descubrir**: los inversores deben estar
  configurados en AhoyDTU (Settings > Inverter). Haga clic en **Probar
  conexión**: indica cuántos inversores gestiona AhoyDTU.
- **«No responde» cada noche**: introduzca las coordenadas en AhoyDTU para
  que conozca la hora de la puesta del sol.
- **«AhoyDTU ha rechazado la contraseña»** / **«protegida con una
  contraseña»**: introduzca la contraseña de administrador de AhoyDTU en la
  configuración.
- **El límite se rechaza de noche**: es normal, el inversor duerme.
- Ponga el nivel de registro en debug en Gladys para ver cada petición.

## Límites

- Desarrollada sin el hardware, contra una simulación de la API de AhoyDTU
  0.8: sus comentarios son bienvenidos.
- AhoyDTU 0.7 y anteriores no están probadas. No se usa MQTT: solo la API
  REST.
- Solo se ofrece el límite relativo no persistente; ni encendido/apagado, ni
  reinicio, ni límite persistente (desgasta la memoria del inversor).
- Sin funciones de frecuencia, corriente o rendimiento.
- Los valores de producción son los del inversor: pueden diferir ligeramente
  de los de un contador.

## Datos y red

- La integración solo habla con la dirección introducida, en HTTP simple (el
  único protocolo de AhoyDTU), en su red local. Nada sale de su casa.
- Guarda en su volumen `/data` la lista de inversores (números de serie,
  nombres, nombres de los paneles), para encontrarlos tras un reinicio. La
  contraseña se queda en la configuración de Gladys y nunca se escribe en un
  registro.
- Sin relación con Hoymiles ni con el proyecto AhoyDTU.
