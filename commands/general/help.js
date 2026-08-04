const { SlashCommandBuilder } = require('discord.js');
const CustomEmbedBuilder = require('../../utils/embedBuilder');
const config = require('../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Mostrar ayuda del bot'),

    async execute(interaction) {
        try {
            const embed = CustomEmbedBuilder.createHelpEmbed([
                {
                    name: 'announce',
                    description: 'Crear anuncios con sistema de tickets (Solo Admin)'
                },
                {
                    name: 'tickets',
                    description: 'Gestionar tickets del servidor (Solo Admin)'
                },
                {
                    name: 'config',
                    description: 'Configurar el bot (Solo Admin)'
                },
                {
                    name: 'help',
                    description: 'Mostrar esta ayuda'
                }
            ]);

            embed.addFields(
                { 
                    name: '🎫 Cómo usar los tickets', 
                    value: '1. Un administrador crea un anuncio con `/announce`\n2. Los usuarios seleccionan una opción del menú\n3. Se crea un canal privado automáticamente\n4. El ticket se puede cerrar con el botón 🔒', 
                    inline: false 
                },
                { 
                    name: '⚙️ Configuración', 
                    value: `**Prefijo:** ${config.prefix}\n**Roles Admin:** ${config.adminRoles.join(', ')}\n**Categoría:** ${config.ticketCategory}`, 
                    inline: false 
                }
            );

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            console.error('❌ Error en comando help:', error);
            await interaction.reply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    'Hubo un error al mostrar la ayuda.',
                    'error'
                )],
                ephemeral: true
            });
        }
    },
};