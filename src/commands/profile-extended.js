import { dbRun, dbRows } from '../db.js';
import { PREFIX } from '../config.js';

export const profileExtendedCommands = [
  {
    name: 'profil-setzen',
    aliases: ['setprofil', 'profil'],
    group: 'profile',
    desc: 'Setzt dein Profil (Alter, Wohnort, Hobbys, Bio)',
    usage: '!profil-setzen [feld] [wert]',
    async run(ctx) {
      const field = ctx.args[0]?.toLowerCase();
      const value = ctx.args.slice(1).join(' ');
      const validFields = ['alter', 'wohnort', 'hobbys', 'bio', 'geburtstag'];
      
      if (!field || !validFields.includes(field)) {
        return ctx.reply(`ℹ️ Gueltige Felder: ${validFields.join(', ')}\nBeispiel: !profil-setzen alter 25`);
      }
      
      if (!value) return ctx.reply('❌ Bitte gib einen Wert an.');
      
      const dbField = { alter: 'age', wohnort: 'location', hobbys: 'hobbies', bio: 'bio', geburtstag: 'birthday' }[field];
      
      await dbRun(
        `INSERT INTO user_profiles (user_jid, name, ${dbField}, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_jid) DO UPDATE SET ${dbField} = excluded.${dbField}, updated_at = excluded.updated_at`,
        [ctx.sender, ctx.pushName || 'Unbekannt', value, Date.now()]
      );
      
      return ctx.reply(`✅ ${field.charAt(0).toUpperCase() + field.slice(1)} gespeichert!`);
    }
  },
  {
    name: 'profil-anzeigen',
    aliases: ['profil', 'meinprofil', 'werbinich'],
    group: 'profile',
    desc: 'Zeigt dein oder ein anderes Profil an',
    usage: '!profil-anzeigen [@user]',
    async run(ctx) {
      const target = ctx.mentionedJids?.[0] || ctx.sender;
      const rows = await dbRows('SELECT * FROM user_profiles WHERE user_jid = ?', [target]);
      
      if (!rows.length) return ctx.reply('ℹ️ Noch kein Profil vorhanden. Erstelle eins mit !profil-setzen');
      
      const p = rows[0];
      const lines = [
        `👤 *Profil von ${p.name || 'Unbekannt'}*`,
        p.age ? `🎂 Alter: ${p.age}` : '',
        p.location ? `📍 Wohnort: ${p.location}` : '',
        p.hobbies ? `🎯 Hobbys: ${p.hobbies}` : '',
        p.bio ? `📝 Bio: ${p.bio}` : '',
        p.birthday ? `🎈 Geburtstag: ${p.birthday}` : '',
      ].filter(Boolean);
      
      return ctx.reply(lines.join('\n'));
    }
  }
];
