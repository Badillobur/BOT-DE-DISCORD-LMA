const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const TicketHandler = require('../../utils/ticketHandler');
const CustomEmbedBuilder = require('../../utils/embedBuilder');
const moment = require('moment');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Ver estadísticas detalladas del bot')
        .addSubcommand(subcommand =>
            subcommand
                .setName('general')
                .setDescription('Estadísticas generales del servidor'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('activity')
                .setDescription('Actividad de tickets por período')
                .addStringOption(option =>
                    option.setName('periodo')
                        .setDescription('Período de tiempo')
                        .addChoices(
                            { name: 'Últimas 24 horas', value: '24h' },
                            { name: 'Última semana', value: '7d' },
                            { name: 'Último mes', value: '30d' },
                            { name: 'Todo el tiempo', value: 'all' }
                        )
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('top-users')
                .setDescription('Usuarios con más tickets')
                .addIntegerOption(option =>
                    option.setName('limite')
                        .setDescription('Número de usuarios a mostrar (máximo 20)')
                        .setMinValue(1)
                        .setMaxValue(20)
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('response-time')
                .setDescription('Tiempo promedio de respuesta y resolución')),

    adminOnly: true,

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const subcommand = interaction.options.getSubcommand();
            const tickets = await TicketHandler.getAllTickets();
            const guildTickets = Object.values(tickets).filter(t => t.guildId === interaction.guild.id);

            switch (subcommand) {
                case 'general':
                    await this.handleGeneralStats(interaction, guildTickets);
                    break;
                
                case 'activity':
                    await this.handleActivityStats(interaction, guildTickets);
                    break;
                
                case 'top-users':
                    await this.handleTopUsers(interaction, guildTickets);
                    break;
                
                case 'response-time':
                    await this.handleResponseTime(interaction, guildTickets);
                    break;
                
                default:
                    await interaction.editReply({
                        embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                            'Error',
                            'Subcomando no válido.',
                            'error'
                        )]
                    });
            }

        } catch (error) {
            console.error('❌ Error en comando stats:', error);
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    'Hubo un error al generar las estadísticas.',
                    'error'
                )]
            });
        }
    },

    async handleGeneralStats(interaction, guildTickets) {
        const totalTickets = guildTickets.length;
        const openTickets = guildTickets.filter(t => t.status === 'open').length;
        const closedTickets = guildTickets.filter(t => t.status === 'closed').length;
        
        // Estadísticas por tipo
        const typeStats = {};
        guildTickets.forEach(ticket => {
            typeStats[ticket.type] = (typeStats[ticket.type] || 0) + 1;
        });

        // Usuarios únicos
        const uniqueUsers = new Set(guildTickets.map(t => t.userId)).size;

        // Tickets hoy
        const today = moment().startOf('day');
        const ticketsToday = guildTickets.filter(t => 
            moment(t.createdAt).isAfter(today)
        ).length;

        // Tickets esta semana
        const weekStart = moment().startOf('week');
        const ticketsThisWeek = guildTickets.filter(t => 
            moment(t.createdAt).isAfter(weekStart)
        ).length;

        const embed = new EmbedBuilder()
            .setTitle('📊 Estadísticas Generales')
            .setColor('#1E90FF')
            .setTimestamp()
            .addFields(
                { name: '🎫 Total de Tickets', value: totalTickets.toString(), inline: true },
                { name: '🟢 Abiertos', value: openTickets.toString(), inline: true },
                { name: '🔒 Cerrados', value: closedTickets.toString(), inline: true },
                { name: '👥 Usuarios Únicos', value: uniqueUsers.toString(), inline: true },
                { name: '📅 Hoy', value: ticketsToday.toString(), inline: true },
                { name: '📊 Esta Semana', value: ticketsThisWeek.toString(), inline: true }
            );

        if (Object.keys(typeStats).length > 0) {
            let typeStatsText = '';
            Object.entries(typeStats)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .forEach(([type, count]) => {
                    const percentage = ((count / totalTickets) * 100).toFixed(1);
                    typeStatsText += `**${type}:** ${count} (${percentage}%)\n`;
                });
            
            embed.addFields({ 
                name: '🏆 Top Tipos de Anuncios', 
                value: typeStatsText || 'Sin datos', 
                inline: false 
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },

    async handleActivityStats(interaction, guildTickets) {
        const periodo = interaction.options.getString('periodo') || '7d';
        let filteredTickets = guildTickets;
        let title = 'Actividad de Tickets';

        // Filtrar por período
        const now = moment();
        switch (periodo) {
            case '24h':
                filteredTickets = guildTickets.filter(t => 
                    moment(t.createdAt).isAfter(now.clone().subtract(24, 'hours'))
                );
                title += ' - Últimas 24 horas';
                break;
            case '7d':
                filteredTickets = guildTickets.filter(t => 
                    moment(t.createdAt).isAfter(now.clone().subtract(7, 'days'))
                );
                title += ' - Última semana';
                break;
            case '30d':
                filteredTickets = guildTickets.filter(t => 
                    moment(t.createdAt).isAfter(now.clone().subtract(30, 'days'))
                );
                title += ' - Último mes';
                break;
            case 'all':
                title += ' - Todo el tiempo';
                break;
        }

        if (filteredTickets.length === 0) {
            return await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Sin Datos',
                    `No hay tickets en el período seleccionado.`,
                    'info'
                )]
            });
        }

        // Agrupar por día
        const dailyStats = {};
        filteredTickets.forEach(ticket => {
            const date = moment(ticket.createdAt).format('YYYY-MM-DD');
            dailyStats[date] = (dailyStats[date] || 0) + 1;
        });

        const embed = new EmbedBuilder()
            .setTitle(`📈 ${title}`)
            .setColor('#32CD32')
            .setTimestamp();

        let activityText = '';
        const sortedDates = Object.keys(dailyStats).sort().slice(-10);
        
        sortedDates.forEach(date => {
            const count = dailyStats[date];
            const formattedDate = moment(date).format('DD/MM/YYYY');
            activityText += `**${formattedDate}:** ${count} tickets\n`;
        });

        if (sortedDates.length > 10) {
            activityText += `\n*...mostrando últimos 10 días*`;
        }

        embed.addFields(
            { name: '📊 Resumen', value: `**Total:** ${filteredTickets.length} tickets\n**Promedio diario:** ${(filteredTickets.length / Math.max(sortedDates.length, 1)).toFixed(1)}`, inline: false },
            { name: '📅 Actividad por Día', value: activityText || 'Sin datos', inline: false }
        );

        await interaction.editReply({ embeds: [embed] });
    },

    async handleTopUsers(interaction, guildTickets) {
        const limite = interaction.options.getInteger('limite') || 10;

        // Contar tickets por usuario
        const userStats = {};
        guildTickets.forEach(ticket => {
            userStats[ticket.userId] = (userStats[ticket.userId] || 0) + 1;
        });

        if (Object.keys(userStats).length === 0) {
            return await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Sin Datos',
                    'No hay tickets en este servidor.',
                    'info'
                )]
            });
        }

        // Ordenar y limitar
        const topUsers = Object.entries(userStats)
            .sort(([,a], [,b]) => b - a)
            .slice(0, limite);

        const embed = new EmbedBuilder()
            .setTitle('🏆 Usuarios con Más Tickets')
            .setColor('#FFD700')
            .setTimestamp();

        let usersText = '';
        topUsers.forEach(([userId, count], index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            usersText += `${medal} <@${userId}>: **${count}** tickets\n`;
        });

        embed.setDescription(usersText);
        embed.setFooter({ text: `Mostrando top ${topUsers.length} usuarios` });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleResponseTime(interaction, guildTickets) {
        const closedTickets = guildTickets.filter(t => t.status === 'closed' && t.closedAt);

        if (closedTickets.length === 0) {
            return await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Sin Datos',
                    'No hay tickets cerrados para calcular tiempos de respuesta.',
                    'info'
                )]
            });
        }

        // Calcular tiempos de resolución
        const resolutionTimes = closedTickets.map(ticket => {
            const created = moment(ticket.createdAt);
            const closed = moment(ticket.closedAt);
            return closed.diff(created, 'minutes');
        });

        const avgResolution = resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length;
        const medianResolution = resolutionTimes.sort((a, b) => a - b)[Math.floor(resolutionTimes.length / 2)];

        // Categorizar por tiempo
        const quick = resolutionTimes.filter(t => t <= 60).length; // <= 1 hora
        const normal = resolutionTimes.filter(t => t > 60 && t <= 1440).length; // 1-24 horas
        const slow = resolutionTimes.filter(t => t > 1440).length; // > 24 horas

        const embed = new EmbedBuilder()
            .setTitle('⏱️ Tiempo de Respuesta y Resolución')
            .setColor('#FF6347')
            .setTimestamp()
            .addFields(
                { name: '📊 Promedio', value: `${Math.round(avgResolution)} minutos\n(${(avgResolution / 60).toFixed(1)} horas)`, inline: true },
                { name: '📈 Mediana', value: `${Math.round(medianResolution)} minutos\n(${(medianResolution / 60).toFixed(1)} horas)`, inline: true },
                { name: '📋 Total Analizados', value: `${closedTickets.length} tickets`, inline: true },
                { name: '⚡ Rápido (≤1h)', value: `${quick} tickets\n${((quick/closedTickets.length)*100).toFixed(1)}%`, inline: true },
                { name: '🕐 Normal (1-24h)', value: `${normal} tickets\n${((normal/closedTickets.length)*100).toFixed(1)}%`, inline: true },
                { name: '🐌 Lento (>24h)', value: `${slow} tickets\n${((slow/closedTickets.length)*100).toFixed(1)}%`, inline: true }
            );

        await interaction.editReply({ embeds: [embed] });
    }
};