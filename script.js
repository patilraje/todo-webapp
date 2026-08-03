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

function getWeekStartSundayISO(date = new Date()) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    d.setDate(d.getDate() - d.getDay())
    return formatLocalISO(d)
}

function ensureBonusWeekReset() {
    const weekStart = getWeekStartSundayISO()
    const stored = localStorage.getItem("bonusWeekStart")

    if (!stored) {
        localStorage.setItem("bonusWeekStart", weekStart)
        return
    }

    if (stored !== weekStart) {
        tasks = []
        saveTasks()
        localStorage.setItem("bonusWeekStart", weekStart)
    }
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

    const todayTab = document.getElementById("tab-today")
    const planningTab = document.getElementById("tab-planning")
    const todayPanel = document.getElementById("panel-today")
    const planningPanel = document.getElementById("panel-planning")

    const isToday = tab === "today"
    todayTab.classList.toggle("is-active", isToday)
    planningTab.classList.toggle("is-active", !isToday)
    todayTab.setAttribute("aria-selected", String(isToday))
    planningTab.setAttribute("aria-selected", String(!isToday))

    todayPanel.classList.toggle("is-active", isToday)
    planningPanel.classList.toggle("is-active", !isToday)
    todayPanel.hidden = !isToday
    planningPanel.hidden = isToday

    if (isToday) {
        renderToday()
    } else {
        renderTasks()
        renderCalendar()
        renderSelectedDay()
    }
}

function refreshAllViews() {
    renderToday()
    renderTasks()
    renderCalendar()
    renderSelectedDay()
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

function moveNonNegotiable(id, direction) {
    const index = nonNegotiables.findIndex(item => item.id === id)
    if (index < 0) return

    const target = index + direction
    if (target < 0 || target >= nonNegotiables.length) return

    const [item] = nonNegotiables.splice(index, 1)
    nonNegotiables.splice(target, 0, item)
    savePlannerData()
    refreshAllViews()
}

function createTaskRow(text, completed, onToggle, onDelete, options = {}) {
    const row = document.createElement("div")
    row.className = "task-row"

    if (options.reorder) {
        const reorder = document.createElement("div")
        reorder.className = "reorder-controls"

        const upButton = document.createElement("button")
        upButton.type = "button"
        upButton.className = "reorder-button"
        upButton.textContent = "↑"
        upButton.setAttribute("aria-label", `Move ${text} up`)
        upButton.disabled = !options.reorder.canMoveUp
        upButton.addEventListener("click", options.reorder.onMoveUp)

        const downButton = document.createElement("button")
        downButton.type = "button"
        downButton.className = "reorder-button"
        downButton.textContent = "↓"
        downButton.setAttribute("aria-label", `Move ${text} down`)
        downButton.disabled = !options.reorder.canMoveDown
        downButton.addEventListener("click", options.reorder.onMoveDown)

        reorder.append(upButton, downButton)
        row.appendChild(reorder)
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

    const recurringRows = nonNegotiables.map((item, index) => {
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
                    canMoveUp: index > 0,
                    canMoveDown: index < nonNegotiables.length - 1,
                    onMoveUp: function() {
                        moveNonNegotiable(item.id, -1)
                    },
                    onMoveDown: function() {
                        moveNonNegotiable(item.id, 1)
                    }
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
        empty: "Extra credit for this week. Resets every Sunday."
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
        nonNegotiables.forEach((item, index) => {
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
                        canMoveUp: index > 0,
                        canMoveDown: index < nonNegotiables.length - 1,
                        onMoveUp: function() {
                            moveNonNegotiable(item.id, -1)
                        },
                        onMoveDown: function() {
                            moveNonNegotiable(item.id, 1)
                        }
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

if (localStorage.getItem("darkMode") === "enabled") {
    document.body.classList.add("dark-mode")
}

document.getElementById("filter-all").classList.add("active-filter")
switchTab(currentTab === "planning" ? "planning" : "today")
