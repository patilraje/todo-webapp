let tasks = JSON.parse(localStorage.getItem("tasks")) || []
let currentFilter = "all"
let searchQuery = ""
let nonNegotiables = JSON.parse(localStorage.getItem("nonNegotiables")) || []
let nonNegotiableCompletions =
    JSON.parse(localStorage.getItem("nonNegotiableCompletions")) || {}
let dayTasks = JSON.parse(localStorage.getItem("dayTasks")) || {}
let selectedDate = todayLocalISO()
let displayedMonth = new Date()
displayedMonth.setDate(1)
let currentTab = localStorage.getItem("activeTab") || "today"

function todayLocalISO() {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
}

function ensureBonusWeekReset() {
    const weekStart = getWeekStartMondayISO()
    const stored = localStorage.getItem("bonusWeekStart")

    if (!stored) {
        localStorage.setItem("bonusWeekStart", weekStart)
        return
    }

    if (stored === weekStart) return

    // If the stored key is any day in the current Mon–Sun week (including an
    // old Sunday-based key), retarget to Monday without wiping this week's bonuses.
    const currentWeekKeys = getWeekDatesMondayToSunday().map(day => day.dateKey)
    if (currentWeekKeys.includes(stored)) {
        localStorage.setItem("bonusWeekStart", weekStart)
        return
    }

    tasks = []
    saveTasks()
    localStorage.setItem("bonusWeekStart", weekStart)
}

ensureBonusWeekReset()

function taskMatchesFilters(task) {
    if (currentFilter === "active" && task.completed) return false
    if (currentFilter === "completed" && !task.completed) return false
    if (searchQuery && !task.text.toLowerCase().includes(searchQuery)) return false
    return true
}

function switchTab(tab) {
    currentTab = tab
    localStorage.setItem("activeTab", tab)

    const tabs = {
        today: document.getElementById("tab-today"),
        planning: document.getElementById("tab-planning"),
        week: document.getElementById("tab-week")
    }
    const panels = {
        today: document.getElementById("panel-today"),
        planning: document.getElementById("panel-planning"),
        week: document.getElementById("panel-week")
    }

    Object.keys(tabs).forEach(name => {
        const isActive = name === tab
        tabs[name].classList.toggle("is-active", isActive)
        tabs[name].setAttribute("aria-selected", String(isActive))
        panels[name].classList.toggle("is-active", isActive)
        panels[name].hidden = !isActive
    })

    if (tab === "today") {
        renderToday()
    } else if (tab === "planning") {
        renderTasks()
        renderCalendar()
        renderSelectedDay()
    } else {
        renderWeek()
    }
}

function refreshAllViews() {
    renderToday()
    renderTasks()
    renderCalendar()
    renderSelectedDay()
    renderWeek()
}

function getTodayMergedProgress() {
    const today = todayLocalISO()
    const planned = dayTasks[today] || []
    const recurringDone = nonNegotiables.filter(item =>
        Boolean(nonNegotiableCompletions[today]?.[item.id])
    ).length
    const plannedDone = planned.filter(task => task.completed).length
    const total = nonNegotiables.length + planned.length
    const completed = recurringDone + plannedDone

    return {
        total,
        completed,
        percent: total === 0 ? 0 : Math.round((completed / total) * 100)
    }
}

function reorderNonNegotiable(fromIndex, insertIndex) {
    if (fromIndex < 0 || fromIndex >= nonNegotiables.length) return
    if (insertIndex > fromIndex) insertIndex -= 1
    if (insertIndex === fromIndex || insertIndex < 0) return
    if (insertIndex > nonNegotiables.length - 1) {
        insertIndex = nonNegotiables.length - 1
    }

    const [item] = nonNegotiables.splice(fromIndex, 1)
    nonNegotiables.splice(insertIndex, 0, item)
    savePlannerData()
    refreshAllViews()
}

function clearDropTargets(listRoot) {
    if (!listRoot) return
    listRoot.querySelectorAll(".task-row.drop-target").forEach(row => {
        row.classList.remove("drop-target")
    })
}

function getNonNegotiableInsertIndex(listRoot, clientY) {
    const rows = [...listRoot.querySelectorAll(".task-row[data-nn-id]")]
    for (let i = 0; i < rows.length; i += 1) {
        const rect = rows[i].getBoundingClientRect()
        if (clientY < rect.top + rect.height / 2) return i
    }
    return rows.length
}

function attachNonNegotiableDrag(handle, row, itemId) {
    const DRAG_THRESHOLD = 6
    let drag = null

    handle.addEventListener("pointerdown", function(event) {
        if (event.pointerType === "mouse" && event.button !== 0) return
        event.preventDefault()
        handle.setPointerCapture(event.pointerId)
        drag = {
            itemId,
            startY: event.clientY,
            started: false,
            fromIndex: nonNegotiables.findIndex(item => item.id === itemId),
            insertIndex: null,
            listRoot: row.parentElement
        }
    })

    handle.addEventListener("pointermove", function(event) {
        if (!drag || drag.itemId !== itemId) return
        if (!drag.started) {
            if (Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD) return
            drag.started = true
            row.classList.add("is-dragging")
            document.body.classList.add("is-reordering")
        }

        clearDropTargets(drag.listRoot)
        const insertIndex = getNonNegotiableInsertIndex(drag.listRoot, event.clientY)
        drag.insertIndex = insertIndex

        const rows = [...drag.listRoot.querySelectorAll(".task-row[data-nn-id]")]
        if (insertIndex < rows.length) {
            rows[insertIndex].classList.add("drop-target")
        } else if (rows.length > 0) {
            rows[rows.length - 1].classList.add("drop-target")
        }
    })

    function endDrag(event) {
        if (!drag || drag.itemId !== itemId) return
        const { started, fromIndex, insertIndex, listRoot } = drag
        drag = null

        try {
            handle.releasePointerCapture(event.pointerId)
        } catch (error) {
            // Pointer may already be released.
        }

        row.classList.remove("is-dragging")
        document.body.classList.remove("is-reordering")
        clearDropTargets(listRoot)

        if (!started || insertIndex === null || fromIndex < 0) return
        reorderNonNegotiable(fromIndex, insertIndex)
    }

    handle.addEventListener("pointerup", endDrag)
    handle.addEventListener("pointercancel", endDrag)
}

function createTaskRow(text, completed, onToggle, onDelete, options = {}) {
    const row = document.createElement("div")
    row.className = "task-row"

    if (options.reorder) {
        row.dataset.nnId = options.reorder.itemId

        const handle = document.createElement("button")
        handle.type = "button"
        handle.className = "drag-handle"
        handle.textContent = "⋮⋮"
        handle.setAttribute("aria-label", `Drag to reorder ${text}`)
        handle.setAttribute("title", "Drag to reorder")
        attachNonNegotiableDrag(handle, row, options.reorder.itemId)
        row.appendChild(handle)
    }

    const label = document.createElement("label")
    const checkbox = document.createElement("input")
    checkbox.type = "checkbox"
    checkbox.checked = completed
    checkbox.addEventListener("change", onToggle)

    const taskText = document.createElement("span")
    taskText.textContent = text
    if (completed) taskText.classList.add("completed")
    if (options.className) taskText.classList.add(options.className)
    if (options.onEdit) {
        taskText.addEventListener("dblclick", options.onEdit)
    }

    label.append(checkbox, taskText)

    if (options.meta) {
        const meta = document.createElement("small")
        meta.textContent = options.meta
        meta.style.marginLeft = "8px"
        label.appendChild(meta)
    }

    const deleteButton = document.createElement("button")
    deleteButton.type = "button"
    deleteButton.className = "icon-button"
    deleteButton.textContent = "×"
    deleteButton.setAttribute("aria-label", `Delete ${text}`)
    deleteButton.addEventListener("click", onDelete)

    row.append(label, deleteButton)
    return row
}

const RING_CIRCUMFERENCE = 2 * Math.PI * 26

function setTodayRing(percent) {
    const ringFill = document.getElementById("todayRingFill")
    const ringText = document.getElementById("todayRingText")
    if (!ringFill || !ringText) return

    ringFill.style.strokeDasharray = String(RING_CIRCUMFERENCE)
    ringFill.style.strokeDashoffset = String(
        RING_CIRCUMFERENCE * (1 - percent / 100)
    )
    ringText.textContent = `${percent}%`
}

function appendGroup(container, title, rows, options = {}) {
    const group = document.createElement("section")
    group.className = `today-group ${options.accent || ""}`.trim()

    const head = document.createElement("div")
    head.className = "today-group-head"

    const heading = document.createElement("h3")
    heading.className = "today-group-title"
    heading.textContent = options.icon ? `${options.icon} ${title}` : title

    const badge = document.createElement("span")
    badge.className = "group-badge"
    badge.textContent = `${options.done || 0}/${rows.length}`

    head.append(heading, badge)
    group.appendChild(head)

    if (rows.length === 0) {
        const empty = document.createElement("p")
        empty.className = "today-empty"
        empty.textContent = options.empty || "Nothing here yet."
        group.appendChild(empty)
    } else {
        const stack = document.createElement("div")
        stack.className = "today-list"
        rows.forEach(row => stack.appendChild(row))
        group.appendChild(stack)
    }

    container.appendChild(group)
}

function renderToday() {
    const list = document.getElementById("todayList")
    const dateLabel = document.getElementById("todayDateLabel")
    const summary = document.getElementById("todaySummary")
    if (!list) return

    const today = todayLocalISO()
    const todayDate = dateFromISO(today)
    const progress = getTodayMergedProgress()

    dateLabel.textContent = todayDate.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric"
    })
    summary.textContent = progress.total
        ? `${progress.completed} of ${progress.total} done`
        : "Nothing planned yet"
    setTodayRing(progress.percent)

    list.innerHTML = ""

    const recurringRows = nonNegotiables.map(item => {
        const completed = Boolean(nonNegotiableCompletions[today]?.[item.id])
        return createTaskRow(
            item.text,
            completed,
            function() {
                if (!nonNegotiableCompletions[today]) {
                    nonNegotiableCompletions[today] = {}
                }
                nonNegotiableCompletions[today][item.id] = !completed
                savePlannerData()
                refreshAllViews()
            },
            function() {
                nonNegotiables = nonNegotiables.filter(current => current.id !== item.id)
                savePlannerData()
                refreshAllViews()
            },
            {
                reorder: {
                    itemId: item.id
                }
            }
        )
    })

    const planned = dayTasks[today] || []
    const plannedRows = planned.map(task =>
        createTaskRow(
            task.text,
            task.completed,
            function() {
                task.completed = !task.completed
                savePlannerData()
                refreshAllViews()
            },
            function() {
                dayTasks[today] = planned.filter(current => current.id !== task.id)
                savePlannerData()
                refreshAllViews()
            }
        )
    )

    const bonusRows = tasks.map((task, index) => {
        let className = ""
        if (task.dueDate && !task.completed) {
            if (task.dueDate < today) className = "overdue"
            else if (task.dueDate === today) className = "due-today"
        }

        return createTaskRow(
            task.text,
            task.completed,
            function() {
                tasks[index].completed = !tasks[index].completed
                saveTasks()
                refreshAllViews()
            },
            function() {
                tasks.splice(index, 1)
                saveTasks()
                refreshAllViews()
            },
            {
                className,
                meta: task.dueDate ? `(${task.dueDate})` : "",
                onEdit: function(e) {
                    e.preventDefault()
                    const span = e.currentTarget
                    const input = document.createElement("input")
                    input.type = "text"
                    input.value = task.text
                    span.replaceWith(input)
                    input.focus()

                    function saveEdit() {
                        const newText = input.value.trim()
                        tasks[index].text = newText || task.text
                        saveTasks()
                        refreshAllViews()
                    }

                    input.addEventListener("keydown", function(event) {
                        if (event.key === "Enter") saveEdit()
                    })
                    input.addEventListener("blur", saveEdit)
                }
            }
        )
    })

    appendGroup(list, "Daily non-negotiables", recurringRows, {
        icon: "⚡",
        accent: "group-flame",
        done: nonNegotiables.filter(item =>
            Boolean(nonNegotiableCompletions[today]?.[item.id])
        ).length,
        empty: "Add your daily must-dos from the Planning tab."
    })
    appendGroup(list, "Planned for today", plannedRows, {
        icon: "🗓️",
        accent: "group-sky",
        done: planned.filter(task => task.completed).length,
        empty: "Nothing scheduled for today yet."
    })
    appendGroup(list, "Bonus", bonusRows, {
        icon: "⭐",
        accent: "group-mint",
        done: tasks.filter(task => task.completed).length,
        empty: "Extra credit for this week. Resets every Monday."
    })
}

function quickAddToday(event) {
    event.preventDefault()
    const input = document.getElementById("todayQuickAdd")
    const text = input.value.trim()
    if (!text) return

    tasks.push({
        text,
        completed: false,
        dueDate: ""
    })
    input.value = ""
    saveTasks()
    refreshAllViews()
}

function renderTasks() {
    let list = document.getElementById("taskList")
    let progressFill = document.getElementById("progressFill")
    let progressLabel = document.getElementById("progressLabel")
    let statTotal = document.getElementById("statTotal")
    let statOpen = document.getElementById("statOpen")
    let statDone = document.getElementById("statDone")
    if (!list) return

    list.innerHTML = ""

    let total = tasks.length
    let completed = tasks.filter(task => task.completed).length
    let remaining = total - completed
    let progressPercent = total === 0 ? 0 : Math.round((completed / total) * 100)

    progressFill.style.width = `${progressPercent}%`
    progressLabel.textContent = `${progressPercent}%`
    statTotal.textContent = String(total)
    statOpen.textContent = String(remaining)
    statDone.textContent = String(completed)

    if (tasks.length === 0) {
        let emptyMsg = document.createElement("p")
        emptyMsg.className = "empty-filter-msg"
        emptyMsg.textContent = "No bonus tasks yet. Add one above or from the Today tab."
        list.appendChild(emptyMsg)
        document.getElementById("taskCount").textContent =
            "0 remaining | 0 total | 0 completed"
        return
    }

    const visibleCount = tasks.filter(taskMatchesFilters).length
    if (visibleCount === 0) {
        let emptyMsg = document.createElement("p")
        emptyMsg.className = "empty-filter-msg"
        emptyMsg.textContent =
            "No tasks match this filter or search. Try All, Active, or clear the search."
        list.appendChild(emptyMsg)
        document.getElementById("taskCount").textContent =
            `${remaining} remaining | ${total} total | ${completed} completed`
        return
    }

    tasks.forEach((task, index) => {
        if (!taskMatchesFilters(task)) return

        let li = document.createElement("li")

        let checkbox = document.createElement("input")
        checkbox.type = "checkbox"
        checkbox.checked = task.completed
        checkbox.onchange = function() {
            tasks[index].completed = checkbox.checked
            saveTasks()
            refreshAllViews()
        }

        let span = document.createElement("span")
        span.textContent = task.text
        span.style.flex = "1"
        span.style.cursor = "pointer"
        span.style.userSelect = "none"

        if (task.completed) {
            span.classList.add("completed")
        }

        if (task.dueDate && !task.completed) {
            const today = todayLocalISO()
            if (task.dueDate < today) {
                span.classList.add("overdue")
            } else if (task.dueDate === today) {
                span.classList.add("due-today")
            }
        }

        let dateSpan = document.createElement("small")
        if (task.dueDate) {
            dateSpan.textContent = " (" + task.dueDate + ")"
            dateSpan.style.marginLeft = "10px"
        }

        span.addEventListener("dblclick", function(e) {
            e.preventDefault()

            let input = document.createElement("input")
            input.type = "text"
            input.value = task.text

            span.replaceWith(input)
            input.focus()

            function saveEdit() {
                let newText = input.value.trim()
                tasks[index].text = newText || task.text
                saveTasks()
                refreshAllViews()
            }

            input.addEventListener("keydown", function(event) {
                if (event.key === "Enter") {
                    saveEdit()
                }
            })

            input.addEventListener("blur", saveEdit)
        })

        let deleteBtn = document.createElement("button")
        deleteBtn.type = "button"
        deleteBtn.className = "icon-button"
        deleteBtn.textContent = "×"
        deleteBtn.onclick = function() {
            tasks.splice(index, 1)
            saveTasks()
            refreshAllViews()
        }

        li.appendChild(checkbox)
        li.appendChild(span)
        li.appendChild(dateSpan)
        li.appendChild(deleteBtn)
        list.appendChild(li)
    })

    document.getElementById("taskCount").textContent =
        `${remaining} remaining | ${total} total | ${completed} completed`
}

function addTask() {
    let input = document.getElementById("taskInput")
    let dateInput = document.getElementById("dueDate")
    let text = input.value.trim()
    let dueDate = ""
    if (dateInput) {
        dueDate = dateInput.value
    }

    if (text === "") return

    tasks.push({
        text: text,
        completed: false,
        dueDate: dueDate
    })

    saveTasks()
    refreshAllViews()

    input.value = ""
    if (dateInput) dateInput.value = ""
}

document.addEventListener("DOMContentLoaded", function() {
    document.getElementById("taskInput").addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
            addTask()
        }
    })
})

function saveTasks() {
    localStorage.setItem("tasks", JSON.stringify(tasks))
}

function clearCompleted() {
    tasks = tasks.filter(task => !task.completed)
    saveTasks()
    refreshAllViews()
}

function markAllComplete() {
    tasks.forEach(task => {
        task.completed = true
    })
    saveTasks()
    refreshAllViews()
}

function clearAllTasks() {
    if (tasks.length === 0) return
    const confirmed = window.confirm("Clear all tasks?")
    if (!confirmed) return
    tasks = []
    saveTasks()
    refreshAllViews()
}

function toggleDarkMode() {
    document.body.classList.toggle("dark-mode")
    localStorage.setItem(
        "darkMode",
        document.body.classList.contains("dark-mode") ? "enabled" : "disabled"
    )
}

function setFilter(filter) {
    currentFilter = filter
    document.getElementById("filter-all").classList.remove("active-filter")
    document.getElementById("filter-active").classList.remove("active-filter")
    document.getElementById("filter-completed").classList.remove("active-filter")
    document.getElementById("filter-" + filter).classList.add("active-filter")
    renderTasks()
}

function setSearchQuery(query) {
    searchQuery = query.trim().toLowerCase()
    renderTasks()
}

function formatLocalISO(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

function dateFromISO(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number)
    return new Date(year, month - 1, day)
}

function savePlannerData() {
    localStorage.setItem("nonNegotiables", JSON.stringify(nonNegotiables))
    localStorage.setItem(
        "nonNegotiableCompletions",
        JSON.stringify(nonNegotiableCompletions)
    )
    localStorage.setItem("dayTasks", JSON.stringify(dayTasks))
}

function getDayProgress(dateKey) {
    const specificTasks = dayTasks[dateKey] || []
    const recurringDone = nonNegotiables.filter(item =>
        Boolean(nonNegotiableCompletions[dateKey]?.[item.id])
    ).length
    const specificDone = specificTasks.filter(task => task.completed).length
    const total = nonNegotiables.length + specificTasks.length
    const completed = recurringDone + specificDone

    return {
        total,
        completed,
        percent: total === 0 ? 0 : Math.round((completed / total) * 100)
    }
}

function renderCalendar() {
    const grid = document.getElementById("calendarGrid")
    const monthLabel = document.getElementById("calendarMonthLabel")
    if (!grid || !monthLabel) return

    const year = displayedMonth.getFullYear()
    const month = displayedMonth.getMonth()
    const firstWeekday = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    monthLabel.textContent = displayedMonth.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric"
    })
    grid.innerHTML = ""

    for (let blank = 0; blank < firstWeekday; blank += 1) {
        const spacer = document.createElement("span")
        spacer.className = "calendar-spacer"
        grid.appendChild(spacer)
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(year, month, day)
        const dateKey = formatLocalISO(date)
        const progress = getDayProgress(dateKey)
        const button = document.createElement("button")
        button.type = "button"
        button.className = "calendar-day"
        button.setAttribute("aria-label", date.toLocaleDateString())

        if (dateKey === todayLocalISO()) button.classList.add("is-today")
        if (dateKey === selectedDate) button.classList.add("is-selected")
        if (progress.total > 0) button.classList.add("has-plans")
        if (progress.percent === 100) button.classList.add("is-complete")

        const dayNumber = document.createElement("span")
        dayNumber.className = "day-number"
        dayNumber.textContent = String(day)

        const status = document.createElement("span")
        status.className = "day-status"
        status.style.setProperty("--day-progress", `${progress.percent}%`)
        status.title = progress.total
            ? `${progress.completed} of ${progress.total} complete`
            : "No plans"

        button.append(dayNumber, status)
        button.addEventListener("click", function() {
            selectedDate = dateKey
            renderCalendar()
            renderSelectedDay()
        })
        grid.appendChild(button)
    }
}

function createPlannerRow(text, completed, onToggle, onDelete, options = {}) {
    return createTaskRow(text, completed, onToggle, onDelete, options)
}

function renderSelectedDay() {
    const dateLabel = document.getElementById("selectedDateLabel")
    const recurringList = document.getElementById("nonNegotiableList")
    const specificList = document.getElementById("dayTaskList")
    const progressFill = document.getElementById("dayProgressFill")
    const progressLabel = document.getElementById("dayProgressLabel")
    if (!dateLabel || !recurringList || !specificList) return

    const selected = dateFromISO(selectedDate)
    const progress = getDayProgress(selectedDate)

    dateLabel.textContent = selected.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric"
    })
    progressFill.style.width = `${progress.percent}%`
    progressLabel.textContent = `${progress.percent}% complete`
    recurringList.innerHTML = ""
    specificList.innerHTML = ""

    if (nonNegotiables.length === 0) {
        recurringList.appendChild(createPlannerEmpty("Add your first daily must-do above."))
    } else {
        nonNegotiables.forEach(item => {
            const completed = Boolean(
                nonNegotiableCompletions[selectedDate]?.[item.id]
            )
            recurringList.appendChild(createPlannerRow(
                item.text,
                completed,
                function() {
                    if (!nonNegotiableCompletions[selectedDate]) {
                        nonNegotiableCompletions[selectedDate] = {}
                    }
                    nonNegotiableCompletions[selectedDate][item.id] = !completed
                    savePlannerData()
                    refreshAllViews()
                },
                function() {
                    nonNegotiables = nonNegotiables.filter(
                        current => current.id !== item.id
                    )
                    savePlannerData()
                    refreshAllViews()
                },
                {
                    reorder: {
                        itemId: item.id
                    }
                }
            ))
        })
    }

    const tasksForDay = dayTasks[selectedDate] || []
    if (tasksForDay.length === 0) {
        specificList.appendChild(createPlannerEmpty("Nothing extra planned for this day."))
    } else {
        tasksForDay.forEach(task => {
            specificList.appendChild(createPlannerRow(
                task.text,
                task.completed,
                function() {
                    task.completed = !task.completed
                    savePlannerData()
                    refreshAllViews()
                },
                function() {
                    dayTasks[selectedDate] = tasksForDay.filter(
                        current => current.id !== task.id
                    )
                    savePlannerData()
                    refreshAllViews()
                }
            ))
        })
    }
}

function createPlannerEmpty(message) {
    const empty = document.createElement("p")
    empty.className = "planner-empty"
    empty.textContent = message
    return empty
}

function addNonNegotiable(event) {
    event.preventDefault()
    const input = document.getElementById("nonNegotiableInput")
    const text = input.value.trim()
    if (!text) return

    nonNegotiables.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        text
    })
    input.value = ""
    savePlannerData()
    refreshAllViews()
}

function addDayTask(event) {
    event.preventDefault()
    const input = document.getElementById("dayTaskInput")
    const text = input.value.trim()
    if (!text) return

    if (!dayTasks[selectedDate]) dayTasks[selectedDate] = []
    dayTasks[selectedDate].push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        text,
        completed: false
    })
    input.value = ""
    savePlannerData()
    refreshAllViews()
}

function changeMonth(offset) {
    displayedMonth.setMonth(displayedMonth.getMonth() + offset)
    renderCalendar()
}

function goToToday() {
    selectedDate = todayLocalISO()
    displayedMonth = dateFromISO(selectedDate)
    displayedMonth.setDate(1)
    renderCalendar()
    renderSelectedDay()
}

function getWeekStartMondayISO(date = new Date()) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const day = d.getDay()
    const offset = day === 0 ? -6 : 1 - day
    d.setDate(d.getDate() + offset)
    return formatLocalISO(d)
}

function getWeekDatesMondayToSunday(date = new Date()) {
    const start = dateFromISO(getWeekStartMondayISO(date))
    return Array.from({ length: 7 }, (_, index) => {
        const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
        return {
            date: day,
            dateKey: formatLocalISO(day)
        }
    })
}

function getBonusCompletedInWeek() {
    // Bonus list resets each Monday; count currently completed bonus items
    // as this week's bonus progress (same list the user sees now).
    return tasks.filter(task => task.completed).length
}

function setWeekRing(percent) {
    const ringFill = document.getElementById("weekRingFill")
    const ringText = document.getElementById("weekRingText")
    if (!ringFill || !ringText) return

    ringFill.style.strokeDasharray = String(RING_CIRCUMFERENCE)
    ringFill.style.strokeDashoffset = String(
        RING_CIRCUMFERENCE * (1 - percent / 100)
    )
    ringText.textContent = `${percent}%`
}

function dayBarTone(progress) {
    if (progress.total === 0) return "empty"
    if (progress.percent >= 80) return "strong"
    if (progress.percent > 0) return "partial"
    return "empty"
}

function renderWeek() {
    const rangeLabel = document.getElementById("weekRangeLabel")
    const summary = document.getElementById("weekSummary")
    const heroNote = document.getElementById("weekHeroNote")
    const bars = document.getElementById("weekBars")
    const bonusNote = document.getElementById("weekBonusNote")
    if (!rangeLabel || !bars) return

    const today = todayLocalISO()
    const weekDays = getWeekDatesMondayToSunday()
    const monday = weekDays[0].date
    const sunday = weekDays[6].date

    rangeLabel.textContent = `${monday.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric"
    })} – ${sunday.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
    })}`

    const dayStats = weekDays.map(({ date, dateKey }) => {
        const progress = getDayProgress(dateKey)
        return {
            date,
            dateKey,
            progress,
            tone: dayBarTone(progress),
            isToday: dateKey === today,
            isFuture: dateKey > today
        }
    })

    const avgPercent = Math.round(
        dayStats.reduce((sum, day) => sum + day.progress.percent, 0) / 7
    )
    const strongDays = dayStats.filter(
        day => day.progress.total > 0 && day.progress.percent >= 80
    ).length
    const activeDays = dayStats.filter(day => day.progress.total > 0).length
    const bonusDone = getBonusCompletedInWeek()

    setWeekRing(avgPercent)
    summary.textContent = `${strongDays} strong day${strongDays === 1 ? "" : "s"} · ${avgPercent}% avg`
    heroNote.textContent = activeDays === 0
        ? "No daily plans logged yet this week — start on Today or Planning."
        : `${activeDays} day${activeDays === 1 ? "" : "s"} with plans · Mon through Sun pulse.`

    bars.innerHTML = ""
    dayStats.forEach(day => {
        const column = document.createElement("div")
        column.className = `week-day${day.isToday ? " is-today" : ""}${day.isFuture ? " is-future" : ""}`

        const name = document.createElement("span")
        name.className = "week-day-name"
        name.textContent = day.date.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2)

        const track = document.createElement("div")
        track.className = "week-day-track"
        const fill = document.createElement("div")
        fill.className = `week-day-fill tone-${day.tone}`
        fill.style.height = `${Math.max(day.progress.percent, day.progress.total > 0 ? 8 : 0)}%`
        track.appendChild(fill)

        const value = document.createElement("span")
        value.className = "week-day-value"
        value.textContent = day.progress.total === 0 ? "—" : `${day.progress.percent}%`

        column.append(name, track, value)
        bars.appendChild(column)
    })

    bonusNote.textContent = bonusDone === 0
        ? "Bonus this week: none completed yet (extra credit, separate from daily pulse)."
        : `Bonus this week: ${bonusDone} completed (extra credit, separate from daily pulse).`
}

if (localStorage.getItem("darkMode") === "enabled") {
    document.body.classList.add("dark-mode")
}

document.getElementById("filter-all").classList.add("active-filter")
const allowedTabs = ["today", "planning", "week"]
switchTab(allowedTabs.includes(currentTab) ? currentTab : "today")
