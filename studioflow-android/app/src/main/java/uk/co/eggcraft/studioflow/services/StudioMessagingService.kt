package uk.co.eggcraft.studioflow.services

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import uk.co.eggcraft.studioflow.MainActivity

private const val CHANNEL_ID = "studio_messages"
private const val CHANNEL_NAME = "Messages"

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
        val title = message.notification?.title
            ?: data["title"]
            ?: data["senderName"]
            ?: "New message"
        val body = message.notification?.body
            ?: data["body"]
            ?: data["text"]
            ?: ""

        ensureChannel(this)
        val orderId = data["orderId"].orEmpty()
        val pushType = data["type"].orEmpty().lowercase()
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (threadId.isNotBlank()) putExtra("studio_thread_id", threadId)
            if (messageId.isNotBlank()) putExtra("studio_message_id", messageId)
            if (orderId.isNotBlank() && (pushType == "delivery" || pushType == "tracking")) {
                putExtra("studio_order_id", orderId)
                putExtra("studio_order_card", "shipping")
            }
            // A customer approving or declining an estimate opens that order on
            // the card carrying the decision.
            if (orderId.isNotBlank() && pushType == "estimate_decision") {
                putExtra("studio_order_id", orderId)
                putExtra("studio_order_card", "estimate")
            }
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            (threadId + orderId).hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        val notificationId = if (threadId.isNotBlank()) threadId.hashCode() else System.currentTimeMillis().toInt()
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(notificationId, notification)
    }

    companion object {
        fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                if (manager.getNotificationChannel(CHANNEL_ID) == null) {
                    val channel = NotificationChannel(
                        CHANNEL_ID,
                        CHANNEL_NAME,
                        NotificationManager.IMPORTANCE_HIGH
                    ).apply { description = "StudioFlow workspace messages" }
                    manager.createNotificationChannel(channel)
                }
            }
        }
    }
}
