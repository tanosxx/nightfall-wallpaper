// One catalogue for the desktop library, panel menu and browser preview.
// Keep this module free of GNOME/browser imports so both runtimes can load it.
export const SCENES = Object.freeze([
    {id: 'nightfall', name: 'Ночной рубеж', tag: '01 / ГОРОД ПОСЛЕ ТИШИНЫ',
        subtitle: 'Дождливый город, транспорт и огни над каналами',
        description: 'Дождь, огни и жизнь, которая продолжается после конца света.',
        detail: 'Ночной город · дождь · транспорт', image: 'assets/city.png',
        page: 'city.html?embed=1', weatherLabel: 'Дождь', control: 'weather'},
    {id: 'polar', name: 'Полярный сигнал', tag: '02 / НА КРАЮ ОБИТАЕМОГО МИРА',
        subtitle: 'Северное сияние над забытой станцией',
        description: 'Северное сияние над забытой станцией. Кто-то всё ещё ждёт сигнала.',
        detail: 'Полярная станция · сияние · снег', image: 'assets/polar.png',
        page: 'polar.html?embed=1', weatherLabel: 'Снег', control: 'weather'},
    {id: 'station', name: 'Дальний рубеж', tag: '03 / ГОРОД МЕЖДУ ЗВЁЗДАМИ',
        subtitle: 'Огни станции, пар и работающие механизмы',
        description: 'Огромный мир между звёздами. Дрейф космической пыли, мерцающие огни и работающие механизмы.',
        detail: 'Глубокий космос · объёмный свет · три режима', image: 'assets/station.png',
        page: 'station-realism.html?embed=1', weatherLabel: 'Активность станции', control: 'activity'},
    {id: 'abyss', name: 'Бездна', tag: '04 / ТАМ, ГДЕ НЕ БЫВАЕТ РАССВЕТА',
        subtitle: 'Жизнь под водой, прожекторы, лифт и переходы',
        description: 'Тёплые окна исследовательской станции в глубине океана. Холодные лучи прорезают тьму, течение несёт серебристую взвесь.',
        detail: 'Глубокий океан · свет во тьме · течение', image: 'assets/abyss.png',
        page: 'abyss.html?embed=1', weatherLabel: 'Сила течения', control: 'flow'},
    {id: 'junction', name: 'Ночной узел', tag: '05 / ПОСЛЕДНИЙ ПОЕЗД НЕ УХОДИТ',
        subtitle: 'Дальний поезд, разноцветный трафик, пар и окна',
        description: 'Город живёт между этажами дорог: движутся фары, гаснут и загораются окна, ветер уносит пар. Вдалеке изредка проходит длинный поезд.',
        detail: 'Живой город · ночной трафик · дальний поезд', image: 'assets/junction.png',
        page: 'junction.html?embed=1', weatherLabel: 'Дождь', control: 'weather'},
    {id: 'cloudcity', name: 'Город над облаками', tag: '06 / ВЫШЕ НЕВИДИМОЙ ЗЕМЛИ',
        subtitle: 'Облачный океан, турбины, огни и далёкая гроза',
        description: 'С технического балкона видны башни над облачным океаном. Между ними плывут облака, вращаются турбины и вспыхивают маяки. На горизонте зреет гроза.',
        detail: 'Облачный океан · турбины · далёкая гроза', image: 'assets/cloudcity.png',
        page: 'cloudcity.html?embed=1&v=right-facades-20261025', weatherLabel: 'Сила ветра', control: 'flow'},
    {id: 'titans', name: 'Пепел титанов', tag: '07 / ПОСЛЕ ПАДЕНИЯ ФЛОТА',
        subtitle: 'Пожары, дым, падающие дредноуты и разборка гигантов',
        description: 'Неизвестная планета после катастрофы. Среди обломков ещё горит огонь, вспыхивает сварка у рухнувших титанов, а небо рассекают горящие дредноуты.',
        detail: 'Чужая планета · огонь и дым · работа у титанов', image: 'assets/titans.png',
        page: 'titans.html?embed=1&v=15', weatherLabel: 'Активность на планете', control: 'activity'},
].map(scene => Object.freeze({...scene, width: 1672, height: 941})));

export function intensityLabels(scene) {
    if (scene.control === 'activity') return scene.id === 'station'
        ? ['Перерыв', 'Спокойная', 'Активная'] : ['Тихо', 'Умеренно', 'Активно'];
    if (scene.control === 'flow') return ['Минимальная', 'Слабая', 'Обычная'];
    return ['Без осадков', 'Слабые', 'Обычные'];
}
