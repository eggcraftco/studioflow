package uk.co.eggcraft.studioflow.services

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import uk.co.eggcraft.studioflow.MainActivity
import uk.co.eggcraft.studioflow.R
import uk.co.eggcraft.studioflow.language.studioT

// One channel per kind of push, so a person can mute delivery pings without
// losing team messages. Ids are stable; names and descriptions follow the app
// language (createNotificationChannel updates those on an existing channel).
private const val CHANNEL_MESSAGES = "studio_messages"
private const val CHANNEL_ORDERS = "studio_orders"
private const val CHANNEL_REMINDERS = "studio_reminders"
private const val CHANNEL_WORKSPACE = "studio_workspace"

class StudioMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        val companyId = StudioMessageRouteHolder.currentCompanyId()
        if (companyId.isNotBlank()) {
            StudioMessageRouteHolder.saveDeviceToken(companyId, token, this)
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val threadId = data["threadId"].orEmpty()
        val messageId = data["messageId"].orEmpty()
        val orderId = data["orderId"].orEmpty()
        val pushType = data["type"].orEmpty().trim().lowercase()
        val channelId = channelFor(pushType, hasThread = threadId.isNotBlank())
        val title = message.notification?.title
            ?: data["title"]
            ?: data["senderName"]
            ?: if (channelId == CHANNEL_MESSAGES) "New message" else "NivaDesk"
        val body = message.notification?.body
            ?: data["body"]
            ?: data["text"]
            ?: ""

        ensureChannel(this)
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (threadId.isNotBlank()) putExtra("studio_thread_id", threadId)
            if (messageId.isNotBlank()) putExtra("studio_message_id", messageId)
            if (orderId.isNotBlank()) {
                // Tapping lands on the order, on the card the push is about.
                val card = when (pushType) {
                    "delivery", "tracking" -> "shipping"
                    // A customer approving or declining an estimate opens the
                    // card carrying the decision.
                    "estimate_decision" -> "estimate"
                    "schedule", "reminder" -> "schedule"
                    "order", "order_update" -> "shipping"
                    else -> ""
                }
                if (card.isNotBlank()) {
                    putExtra("studio_order_id", orderId)
                    putExtra("studio_order_card", card)
                }
            }
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            (threadId + orderId).hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_stat_nivadesk)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        val notificationId = when {
            threadId.isNotBlank() -> threadId.hashCode()
            orderId.isNotBlank() -> (pushType + orderId).hashCode()
            else -> System.currentTimeMillis().toInt()
        }
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(notificationId, notification)
    }

    companion object {
        /** Which channel a push belongs on, from its `type` field. */
        fun channelFor(type: String, hasThread: Boolean = false): String = when (type.trim().lowercase()) {
            "message", "messages", "chat", "team_chat", "direct_message", "mention" -> CHANNEL_MESSAGES
            "delivery", "tracking", "estimate_decision", "order", "order_update", "shipping" -> CHANNEL_ORDERS
            "schedule", "reminder", "reminders" -> CHANNEL_REMINDERS
            // Pushes without a type are the original team messages: they carry a thread.
            "" -> if (hasThread) CHANNEL_MESSAGES else CHANNEL_WORKSPACE
            else -> CHANNEL_WORKSPACE
        }

        fun ensureChannel(context: Context) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val lang = StudioMessageRouteHolder.currentLanguage(context)
            fun channel(id: String, name: String, description: String, importance: Int) {
                manager.createNotificationChannel(
                    NotificationChannel(id, studioT(name, lang), importance).apply {
                        this.description = studioT(description, lang)
                    }
                )
            }
            channel(
                CHANNEL_MESSAGES, "Messages",
                "Team chat and direct messages in your NivaDesk workspace.",
                NotificationManager.IMPORTANCE_HIGH
            )
            channel(
                CHANNEL_ORDERS, "Orders & deliveries",
                "Order updates, delivery tracking and estimate decisions.",
                NotificationManager.IMPORTANCE_DEFAULT
            )
            channel(
                CHANNEL_REMINDERS, "Reminders & schedule",
                "Schedule alerts and reminders for your orders.",
                NotificationManager.IMPORTANCE_HIGH
            )
            channel(
                CHANNEL_WORKSPACE, "Workspace & billing",
                "Workspace, team and billing notices.",
                NotificationManager.IMPORTANCE_DEFAULT
            )
        }
    }
}
