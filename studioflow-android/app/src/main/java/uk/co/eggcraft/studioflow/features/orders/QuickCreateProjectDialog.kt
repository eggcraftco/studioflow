package uk.co.eggcraft.studioflow.features.orders

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.rememberDatePickerState
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uk.co.eggcraft.studioflow.data.model.NewProjectDraft
import uk.co.eggcraft.studioflow.data.model.StudioCustomer
import uk.co.eggcraft.studioflow.data.model.customerNameKey
import uk.co.eggcraft.studioflow.features.shell.OrderCreateOutcome
import uk.co.eggcraft.studioflow.language.LocalStudioLanguage
import uk.co.eggcraft.studioflow.language.studioT

/**
 * The form that stands between "+ Add Project" and an actual project. Nothing
 * is written while it is open — the caller writes only what comes back through
 * [onCreate], and only when Create is pressed.
 *
 * Every field is optional. A customer is optional because a project may be
 * opened for stock or for the window with nobody attached; the dialog therefore
 * never invents one, and an empty customer travels to the server as an empty
 * value rather than as a missing key.
 *
 * The form also stays up until the server has answered. It used to close on the
 * press, which meant a workspace at its plan's order limit watched the form
 * vanish and took the refusal as a success — the customer, the name and the due
 * date all gone, and the sentence explaining why hidden behind the header's
 * cloud icon. Now Create submits, the form waits, and a refusal is printed here
 * with every typed value still in place, so the person can free a slot or
 * upgrade and press Create again without filling the form in a second time.
 * [outcome] is how the wait ends: [onDismiss] is called only when the create
 * actually went through.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuickCreateProjectDialog(
    customers: List<StudioCustomer>,
    creating: Boolean,
    outcome: OrderCreateOutcome,
    onDismiss: () -> Unit,
    onCreate: (NewProjectDraft) -> Unit
) {
    val lang = LocalStudioLanguage.current
    val t: (String) -> String = { studioT(it, lang) }

    var customerText by rememberSaveable { mutableStateOf("") }
    var projectName by rememberSaveable { mutableStateOf("") }
    var dueDate by rememberSaveable { mutableStateOf("") }
    var showDatePicker by rememberSaveable { mutableStateOf(false) }

    // The attempt count as it stood when Create was pressed; -1 while nothing is
    // in flight. Watching the count rather than `creating` survives a refusal
    // that arrives inside a single frame, and survives a rotation mid-create.
    var submittedAt by rememberSaveable { mutableStateOf(-1) }
    var refusal by rememberSaveable { mutableStateOf("") }
    val submitting = submittedAt >= 0

    LaunchedEffect(outcome.finished) {
        if (submittedAt >= 0 && outcome.finished > submittedAt) {
            submittedAt = -1
            if (outcome.errorMessage.isBlank()) onDismiss() else refusal = outcome.errorMessage
        }
    }

    // Same rule the directory and the orders list use, so a customer typed in
    // lowercase is the customer that already exists rather than a second one.
    val typedKey = customerNameKey(customerText)
    val matched = remember(customerText, customers) {
        if (typedKey.isBlank()) null else customers.firstOrNull { customerNameKey(it.name) == typedKey }
    }
    val suggestions = remember(customerText, customers) {
        val pool = customers.filter { it.name.isNotBlank() }
        val listed = if (typedKey.isBlank()) pool else pool.filter { customerNameKey(it.name).contains(typedKey) }
        listed.sortedBy { customerNameKey(it.name) }.take(6)
    }

    val dueDateInvalid = dueDate.isNotBlank() && QuickCreateDates.parse(dueDate) == null
    val busy = creating || submitting
    val canSave = !busy && !dueDateInvalid

    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(t("New Project"), fontWeight = FontWeight.ExtraBold) },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 460.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    t("Customer, name and due date are all optional."),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp
                )
                OutlinedTextField(
                    value = customerText,
                    onValueChange = { customerText = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = { Text(t("Customer (optional)")) },
                    placeholder = { Text(t("Search customers, or type a new name")) },
                    leadingIcon = { Icon(Icons.Filled.Person, contentDescription = null, modifier = Modifier.size(18.dp)) },
                    trailingIcon = {
                        if (customerText.isNotBlank()) {
                            TextButton(onClick = { customerText = "" }) { Text(t("Clear")) }
                        }
                    }
                )
                when {
                    customerText.isBlank() -> Text(
                        t("No customer — the project is opened for the workshop."),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp
                    )
                    matched != null -> Text(
                        t("Joins the customer you already have."),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp
                    )
                    else -> Text(
                        t("This adds a new customer."),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp
                    )
                }
                suggestions.filter { customerNameKey(it.name) != typedKey }.forEach { customer ->
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { customerText = customer.name }
                    ) {
                        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                            Text(customer.name, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            val detail = listOf(customer.email, customer.phone).filter { it.isNotBlank() }.joinToString(" · ")
                            if (detail.isNotBlank()) {
                                Text(detail, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                            }
                        }
                    }
                }
                OutlinedTextField(
                    value = projectName,
                    onValueChange = { projectName = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = { Text(t("Project Name (optional)")) },
                    placeholder = { Text(t("Leave blank and we will number it for you")) }
                )
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    OutlinedTextField(
                        value = dueDate,
                        onValueChange = { dueDate = it },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        isError = dueDateInvalid,
                        label = { Text(t("Due Date (optional)")) },
                        placeholder = { Text("2026-09-30") }
                    )
                    IconButton(onClick = { showDatePicker = true }) {
                        Icon(Icons.Filled.DateRange, contentDescription = t("Due Date (optional)"))
                    }
                }
                if (dueDateInvalid) {
                    Text(
                        t("Use the date format 2026-09-30."),
                        color = MaterialTheme.colorScheme.error,
                        fontSize = 12.sp
                    )
                }
                // The server's own sentence — a plan ceiling, a role refusal or a
                // network failure — said where the person is looking.
                if (refusal.isNotBlank()) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = MaterialTheme.colorScheme.errorContainer,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Text(
                                refusal,
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp
                            )
                            Text(
                                t("Nothing was created — everything you typed is still here."),
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                fontSize = 12.sp
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = canSave,
                onClick = {
                    // Noted before the call goes out, so the answer cannot arrive
                    // before the form is watching for it.
                    submittedAt = outcome.finished
                    refusal = ""
                    onCreate(
                        NewProjectDraft(
                            // The id wins on the server, so a match sends it and a
                            // fresh name sends only text.
                            customerId = matched?.id.orEmpty(),
                            customerName = customerText.trim(),
                            projectName = projectName.trim(),
                            dueDate = dueDate.trim()
                        )
                    )
                }
            ) { Text(if (busy) t("Creating...") else t("Create"), fontWeight = FontWeight.ExtraBold) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !busy) { Text(t("Cancel")) }
        }
    )

    if (showDatePicker) {
        // An order stores a due date as a count of days after the payment date,
        // and zero already means "no due date" everywhere it is read — so the
        // earliest date the schema can express is tomorrow. The picker greys out
        // today rather than letting the server quietly move a chosen date.
        val earliest = QuickCreateDates.today().plusDays(1)
        val pickerState = rememberDatePickerState(
            initialSelectedDateMillis = QuickCreateDates.pickerMillis(
                QuickCreateDates.parse(dueDate) ?: earliest
            ),
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean =
                    utcTimeMillis >= QuickCreateDates.pickerMillis(earliest)

                override fun isSelectableYear(year: Int): Boolean = year >= earliest.year
            }
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    val picked = pickerState.selectedDateMillis
                    showDatePicker = false
                    if (picked != null) dueDate = QuickCreateDates.isoFromPickerMillis(picked)
                }) { Text(t("Done"), fontWeight = FontWeight.Bold) }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text(t("Cancel")) }
            }
        ) { DatePicker(state = pickerState) }
    }
}
