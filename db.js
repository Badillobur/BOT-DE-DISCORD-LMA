const mongoose = require('mongoose');

// Schema para anuncios
const AnnouncementSchema = new mongoose.Schema({
    _id: { type: String }, // El ID es el nombre (ej: "mi-producto")
    title: { type: String, required: true },
    description: { type: String, required: true },
    color: { type: String, default: '#FFD700' },
    image: { type: String, default: null },
    options: [{
        label: String,
        description: String,
        value: String,
        emoji: String
    }]
}, { timestamps: true });

// Schema para configuración por servidor
const GuildConfigSchema = new mongoose.Schema({
    _id: { type: String }, // guildId
    prefix: { type: String, default: '!' },
    embedColor: { type: String, default: '#FFD700' },
    ticketCategory: { type: String, default: 'TICKETS' },
    logChannel: { type: String, default: 'logs' },
    adminRoles: { type: [String], default: ['Admin', 'Moderador'] }
}, { timestamps: true });

// Schema para tickets
const TicketSchema = new mongoose.Schema({
    _id: { type: String },
    channelId: String,
    userId: String,
    guildId: String,
    ownerId: String,
    type: String,
    option: String,
    optionValue: String,
    status: { type: String, default: 'open' },
    closedAt: String,
    closedBy: String
}, { timestamps: true });

const Announcement = mongoose.model('Announcement', AnnouncementSchema);
const GuildConfig = mongoose.model('GuildConfig', GuildConfigSchema);
const Ticket = mongoose.model('Ticket', TicketSchema);

// Conectar a MongoDB
async function connectDB() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.log('⚠️  MONGODB_URI no configurado - usando archivos locales'.yellow);
        return false;
    }
    try {
        await mongoose.connect(uri);
        console.log('✅ MongoDB conectado'.green);
        return true;
    } catch (error) {
        console.error('❌ Error conectando MongoDB:', error.message);
        return false;
    }
}

module.exports = { connectDB, Announcement, GuildConfig, Ticket };