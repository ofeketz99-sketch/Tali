// דגלים בצבעים למסמכים. הדגל נשמר במאפייני המסמך ("flag: red", ראו getFlag/setFlag ב־vault-data.js),
// ומוצג: נקודה בעץ, רשימת "מסומנים" בסרגל הימני, בלוח ההקשר (מידע), ובתפריטים.
// הצבעים עצמם ב־styles.css (--flag-red וכו'), כדי שיתאימו לבהיר ולכהה.
export const FLAG_LIST = [
  { id: 'red', name: 'אדום' },
  { id: 'orange', name: 'כתום' },
  { id: 'yellow', name: 'צהוב' },
  { id: 'green', name: 'ירוק' },
  { id: 'blue', name: 'כחול' },
  { id: 'purple', name: 'סגול' },
];
export const flagName = (id) => FLAG_LIST.find((f) => f.id === id)?.name || '';
