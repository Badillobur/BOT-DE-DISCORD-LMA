# 🤖 Discord Bot de Tickets Personalizable

Bot de Discord avanzado para sistema de tickets con anuncios personalizables y completamente configurable para cualquier tipo de servidor.

## ✨ Características Principales

### 🎫 Sistema de Tickets
- **Menús desplegables personalizables** - Completamente configurable para cualquier producto/servicio
- **Creación automática de canales privados**
- **Botones de cierre integrados**
- **Gestión completa de permisos**

### 📢 Anuncios Personalizables
- **Múltiples tipos de anuncios** (Premium, VIP, Servicios)
- **Embeds con imágenes y colores personalizados**
- **Opciones de precios y duraciones flexibles**
- **Sistema de plantillas reutilizables**

### 🛠️ Administración Avanzada
- **Configuraciones por servidor independientes**
- **Sistema de blacklist y límites de usuarios**
- **Estadísticas detalladas y reportes**
- **Gestión de roles administrativos**

### 📊 Logs y Respaldos
- **Logging automático de todas las acciones**
- **Respaldos automáticos programados**
- **Exportación e importación de configuraciones**
- **Sistema de recuperación ante fallos**

## 🚀 Instalación Rápida

1. **Clonar e instalar dependencias:**
```bash
cd "C:\Users\Administrator\Documents\DiscordBot-Tickets"
npm install
```

2. **Configurar el bot:**
- Editar `config.json` con tu token y client ID
- Ejecutar `node deploy-commands.js` para registrar comandos slash

3. **Iniciar el bot:**
```bash
npm start
```

## 📋 Comandos Principales

### Para Administradores:
- `/announce` - Crear anuncios con sistema de tickets
- `/manage-announcements` - Gestionar tipos de anuncios
- `/tickets` - Administrar tickets del servidor
- `/user-management` - Blacklist y límites de usuarios
- `/stats` - Estadísticas detalladas
- `/logs` - Ver y exportar logs
- `/backup` - Gestionar respaldos
- `/server-config` - Configuración por servidor

### Para Usuarios:
- `/help` - Mostrar ayuda
- Interactuar con menús desplegables en anuncios

## 🎯 Ejemplo de Uso

1. **Crear anuncio Premium:**
```
/announce tipo:premium canal:#anuncios
```

2. **Los usuarios seleccionan opción del menú:**
- "Plan Básico - $15 (7 días)"
- "Plan Premium - $35 (30 días)"  
- "Plan Elite - $90 (90 días)"

3. **Se crea canal privado automáticamente**

## 🔧 Configuración Avanzada

### Personalizar Anuncios:
```json
{
  "announcements": {
    "mi_producto": {
      "title": "Mi Producto Premium",
      "description": "Descripción detallada...",
      "color": "#FFD700",
      "image": "https://example.com/imagen.png",
      "options": [
        {
          "label": "Plan Básico - $10",
          "description": "Duración: 30 días",
          "emoji": "💎",
          "value": "plan_basico"
        }
      ]
    }
  }
}
```

### Configurar por Servidor:
```
/server-config set clave:embedColor valor:#FF0000
/server-config set clave:ticketCategory valor:MIS_TICKETS
```

## 📱 Características Especiales

- ✅ **Multi-servidor** - Configuraciones independientes
- ✅ **Respaldos automáticos** - Diarios completos + incrementales cada 6h  
- ✅ **Sistema de logs** - Archivos JSON organizados por fecha
- ✅ **Blacklist automática** - Cierra tickets al bloquear usuarios
- ✅ **Límites por usuario** - Controla tickets simultáneos
- ✅ **Exportar/Importar** - Configuraciones portables
- ✅ **Validaciones** - Previene configuraciones inválidas

## 🛡️ Seguridad

- Validación de permisos en todos los comandos
- Blacklist con cierre automático de tickets
- Logs de todas las acciones administrativas
- Respaldos automáticos antes de operaciones críticas

## 📞 Soporte

El bot está diseñado para ser completamente autónomo con sistemas de logs y respaldos que facilitan el mantenimiento y la resolución de problemas.

**Desarrollado por:** Tu Servidor
**Versión:** 1.0.0