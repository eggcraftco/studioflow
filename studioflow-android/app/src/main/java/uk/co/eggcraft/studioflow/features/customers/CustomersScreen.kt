package uk.co.eggcraft.studioflow.features.customers

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import uk.co.eggcraft.studioflow.data.model.StudioOrder
import uk.co.eggcraft.studioflow.features.shell.SectionHeader
import uk.co.eggcraft.studioflow.features.shell.StudioFlowUiState
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue

@Composable
fun CustomersScreen(state: StudioFlowUiState, focusedCustomerName: String = "") {
    val customers = remember(state.orders) { customersFromOrders(state.orders) }
    var searchText by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(focusedCustomerName) {
        if (focusedCustomerName.isNotBlank()) {
            searchText = focusedCustomerName
        }
    }
    val visibleCustomers = remember(customers, searchText) {
        val query = searchText.trim().lowercase(Locale.UK)
        if (query.isBlank()) {
            customers
        } else {
            customers.filter { customer ->
                customer.name.lowercase(Locale.UK).contains(query) ||
                    customer.designs.any { it.lowercase(Locale.UK).contains(query) }
            }
        }
    }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        SectionHeader(
            title = "Customers",
            subtitle = "${visibleCustomers.size} customers",
            trailingIcon = Icons.Filled.Tune
        )
        OutlinedTextField(
            value = searchText,
            onValueChange = { searchText = it },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            singleLine = true,
            shape = RoundedCornerShape(14.dp),
            placeholder = { Text("Search...") }
        )
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .padding(top = 14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(visibleCustomers, key = { it.name }) { customer ->
                CustomerRow(customer = customer)
            }
        }
        Surface(color = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f), shadowElevation = 4.dp) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Icon(Icons.Filled.People, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("${visibleCustomers.size} Customers", fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
            }
        }
    }
}

@Composable
private fun CustomerRow(customer: CustomerSummary) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(60.dp)
                    .background(StudioBlue.copy(alpha = 0.16f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = customer.name.take(1).uppercase(Locale.UK),
                    color = StudioBlue,
                    fontSize = 23.sp,
                    fontWeight = FontWeight.ExtraBold
                )
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = customer.name,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold
                )
                Text(
                    text = customer.designs.joinToString(" · ").ifBlank { "-" },
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = customer.lastDate?.let { dateFormatter.format(it) } ?: "-",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.SemiBold
                )
            }
            Icon(Icons.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private data class CustomerSummary(
    val name: String,
    val designs: List<String>,
    val lastDate: Date?
)

private val dateFormatter = SimpleDateFormat("d MMM yyyy", Locale.UK)

private fun customersFromOrders(orders: List<StudioOrder>): List<CustomerSummary> {
    return orders
        .filter { order -> !order.displayCustomerName.equals("New Project", ignoreCase = true) }
        .groupBy { it.displayCustomerName }
        .map { (name, grouped) ->
            CustomerSummary(
                name = name,
                designs = grouped.map { it.designName.ifBlank { it.watchRef } }.filter { it.isNotBlank() }.distinct().take(3),
                lastDate = grouped.maxByOrNull { it.paymentDate }?.paymentDate
            )
        }
        .sortedBy { it.name.lowercase(Locale.UK) }
}
