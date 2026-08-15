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

const CONFETTI_COLORS = [
    "#6366f1",
    "#8b5cf6",
    "#10b981",
    "#f59e0b",
    "#ec4899",
    "#06b6d4"
]

function todayLocalISO() {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
}

function celebrateConfetti() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    let layer = document.getElementById("confettiLayer")
    if (!layer) {
        layer = document.createElement("div")
        layer.id = "confettiLayer"
        layer.className = "confetti-layer"
        layer.setAttribute("aria-hidden", "true")
        document.body.appendChild(layer)
    }

    const count = 28
    for (let i = 0; i < count; i += 1) {
        const fromLeft = i < count / 2
        const particle = document.createElement("span")
        particle.className = "confetti-particle"
        particle.style.setProperty(
            "--confetti-color",
            CONFETTI_COLORS[i % CONFETTI_COLORS.length]
        )
        particle.style.setProperty("--confetti-delay", `${Math.random() * 0.18}s`)
        particle.style.setProperty(
            "--confetti-duration",
            `${1.15 + Math.random() * 0.55}s`
        )
        particle.style.setProperty(
            "--confetti-x-start",
            fromLeft ? `${Math.random() * 6}%` : `${94 + Math.random() * 6}%`
        )
        particle.style.setProperty(
            "--confetti-x-drift",
            fromLeft
                ? `${18 + Math.random() * 32}vw`
                : `${-18 - Math.random() * 32}vw`
        )
        particle.style.setProperty(
            "--confetti-y-start",
            `${12 + Math.random() * 76}vh`
        )
        particle.style.setProperty(
            "--confetti-y-drift",
            `${8 + Math.random() * 28}vh`
        )
        particle.style.setProperty(
            "--confetti-rotation",
            `${Math.random() * 720 - 360}deg`
        )
        layer.appendChild(particle)
        particle.addEventListener("animationend", () => particle.remove())
    }

    clearTimeout(celebrateConfetti._cleanup)
    celebrateConfetti._cleanup = setTimeout(() => {
        layer.innerHTML = ""
    }, 2200)
}

function maybeCelebrateDayComplete(dateKey, previousPercent) {
    const progress = getDayProgress(dateKey)
    if (progress.total > 0 && progress.percent === 100 && previousPercent < 100) {
        celebrateConfetti()
    }
}

function setBonusCompletedById(taskId, completed) {
    const index = tasks.findIndex(task => task.id === taskId)
    setBonusCompleted(index, completed)
}

function setBonusCompleted(index, completed) {
    if (index < 0 || index >= tasks.length) return
    const wasCompleted = Boolean(tasks[index].completed)
    tasks[index].completed = Boolean(completed)
    saveTasks()
    refreshAllViews()
    if (completed && !wasCompleted) celebrateConfetti()
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

    tasks = tasks.filter(task => !task.completed)
    saveTasks()
    localStorage.setItem("bonusWeekStart", weekStart)
}

ensureBonusWeekReset()

function generateTaskId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function ensureBonusTaskIds() {
    let changed = false
    tasks.forEach(task => {
        if (!task.id) {
            task.id = generateTaskId()
            changed = true
        }
    })
    if (changed) saveTasks()
}

ensureBonusTaskIds()

function yesterdayLocalISO() {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
}

function ensureNonNegotiableDates() {
    let changed = false
    nonNegotiables.forEach(item => {
        if (!item.startDate) {
            item.startDate = "1970-01-01"
            changed = true
        }
        if (item.endDate === undefined) {
            item.endDate = null
            changed = true
        }
    })
    if (changed) savePlannerData()
}

function isNonNegotiableActiveOnDate(item, dateKey) {
    const start = item.startDate || "1970-01-01"
    if (dateKey < start) return false
    if (item.endDate && dateKey > item.endDate) return false
    return true
}

function getNonNegotiablesForDate(dateKey) {
    return nonNegotiables.filter(item => isNonNegotiableActiveOnDate(item, dateKey))
}

function clearNnCompletionsFromDate(itemId, fromDateKey) {
    Object.keys(nonNegotiableCompletions).forEach(dateKey => {
        if (dateKey < fromDateKey) return
        if (nonNegotiableCompletions[dateKey]?.[itemId] !== undefined) {
            delete nonNegotiableCompletions[dateKey][itemId]
        }
    })
}

function clearNnCompletionsForId(itemId) {
    Object.keys(nonNegotiableCompletions).forEach(dateKey => {
        if (nonNegotiableCompletions[dateKey]?.[itemId] !== undefined) {
            delete nonNegotiableCompletions[dateKey][itemId]
        }
    })
}

function getFullIndexForActiveInsert(insertIndex, dateKey = todayLocalISO()) {
    const activeIndices = []
    nonNegotiables.forEach((item, index) => {
        if (isNonNegotiableActiveOnDate(item, dateKey)) activeIndices.push(index)
    })
    if (insertIndex >= activeIndices.length) {
        if (activeIndices.length === 0) return nonNegotiables.length
        return activeIndices[activeIndices.length - 1] + 1
    }
    return activeIndices[Math.max(0, insertIndex)]
}

function reorderActiveNonNegotiables(taskId, insertIndex) {
    const today = todayLocalISO()
    const activeIndices = []
    nonNegotiables.forEach((item, index) => {
        if (isNonNegotiableActiveOnDate(item, today)) activeIndices.push(index)
    })
    const fromActive = activeIndices.findIndex(
        index => nonNegotiables[index].id === taskId
    )
    if (fromActive < 0) return false
    const activeItems = activeIndices.map(index => nonNegotiables[index])
    if (!reorderInArray(activeItems, fromActive, insertIndex)) return false
    activeIndices.forEach((arrayIndex, j) => {
        nonNegotiables[arrayIndex] = activeItems[j]
    })
    return true
}

function endNonNegotiableFromToday(taskId) {
    const today = todayLocalISO()
    const index = getNonNegotiableIndex(taskId)
    if (index < 0) return null
    const item = nonNegotiables[index]
    const start = item.startDate || "1970-01-01"

    if (start >= today) {
        nonNegotiables.splice(index, 1)
        clearNnCompletionsFromDate(taskId, today)
        return item
    }

    item.endDate = yesterdayLocalISO()
    clearNnCompletionsFromDate(taskId, today)
    return item
}

function deleteNonNegotiableFromToday(taskId) {
    const today = todayLocalISO()
    const item = nonNegotiables[getNonNegotiableIndex(taskId)]
    if (!item || !isNonNegotiableActiveOnDate(item, today)) return
    endNonNegotiableFromToday(taskId)
    savePlannerData()
    refreshAllViews()
}

function renameNonNegotiableFromToday(taskId, newText) {
    const today = todayLocalISO()
    const index = getNonNegotiableIndex(taskId)
    if (index < 0) return
    const item = nonNegotiables[index]
    if (!isNonNegotiableActiveOnDate(item, today)) return
    if (item.text === newText) return

    const start = item.startDate || "1970-01-01"
    if (start >= today) {
        item.text = newText
        if (!item.startDate) item.startDate = today
        item.endDate = null
        savePlannerData()
        refreshAllViews()
        return
    }

    item.endDate = yesterdayLocalISO()
    clearNnCompletionsFromDate(taskId, today)
    nonNegotiables.splice(index + 1, 0, {
        id: generateTaskId(),
        text: newText,
        startDate: today,
        endDate: null
    })
    savePlannerData()
    refreshAllViews()
}

function createNonNegotiable(text, insertIndex = null) {
    const today = todayLocalISO()
    const item = {
        id: generateTaskId(),
        text,
        startDate: today,
        endDate: null
    }
    if (insertIndex === null || insertIndex === undefined) {
        nonNegotiables.push(item)
    } else {
        nonNegotiables.splice(getFullIndexForActiveInsert(insertIndex, today), 0, item)
    }
}

ensureNonNegotiableDates()

function getNonNegotiableIndex(taskId) {
    return nonNegotiables.findIndex(item => item.id === taskId)
}

function getDayTaskIndex(dateKey, taskId) {
    const list = dayTasks[dateKey] || []
    return list.findIndex(task => task.id === taskId)
}

function getBonusIndex(taskId) {
    return tasks.findIndex(task => task.id === taskId)
}

function clampInsertIndex(insertIndex, length) {
    if (insertIndex === null || insertIndex === undefined || Number.isNaN(insertIndex)) {
        return length
    }
    return Math.max(0, Math.min(insertIndex, length))
}

function reorderInArray(array, fromIndex, insertIndex) {
    if (fromIndex < 0 || fromIndex >= array.length) return false
    let target = insertIndex
    if (target > fromIndex) target -= 1
    if (target === fromIndex || target < 0) return false
    if (target > array.length - 1) target = array.length - 1
    const [item] = array.splice(fromIndex, 1)
    array.splice(target, 0, item)
    return true
}

function insertAt(array, item, insertIndex) {
    const index = clampInsertIndex(insertIndex, array.length)
    array.splice(index, 0, item)
}

function moveTask({
    fromBucket,
    toBucket,
    taskId,
    dateKey,
    insertIndex,
    dueDateOnBonus = ""
}) {
    if (!fromBucket || !toBucket || !taskId) return

    if (fromBucket === toBucket) {
        if (fromBucket === "nonNegotiable") {
            if (reorderActiveNonNegotiables(taskId, insertIndex)) {
                savePlannerData()
                refreshAllViews()
            }
            return
        }
        if (fromBucket === "dayTask") {
            const list = dayTasks[dateKey] || []
            const fromIndex = getDayTaskIndex(dateKey, taskId)
            if (reorderInArray(list, fromIndex, insertIndex)) {
                dayTasks[dateKey] = list
                savePlannerData()
                refreshAllViews()
            }
            return
        }
        if (fromBucket === "bonus") {
            const fromIndex = getBonusIndex(taskId)
            if (reorderInArray(tasks, fromIndex, insertIndex)) {
                saveTasks()
                refreshAllViews()
            }
        }
        return
    }

    if (fromBucket === "nonNegotiable") {
        const fromIndex = getNonNegotiableIndex(taskId)
        if (fromIndex < 0) return
        const item = nonNegotiables[fromIndex]
        const completed = Boolean(nonNegotiableCompletions[dateKey]?.[item.id])
        const moved = {
            id: item.id,
            text: item.text,
            completed
        }
        endNonNegotiableFromToday(taskId)

        if (toBucket === "dayTask") {
            if (!dayTasks[dateKey]) dayTasks[dateKey] = []
            insertAt(dayTasks[dateKey], {
                id: moved.id,
                text: moved.text,
                completed: moved.completed
            }, insertIndex)
            savePlannerData()
        } else if (toBucket === "bonus") {
            insertAt(tasks, {
                id: moved.id,
                text: moved.text,
                completed: false,
                dueDate: ""
            }, insertIndex)
            saveTasks()
            savePlannerData()
        }
        refreshAllViews()
        return
    }

    if (fromBucket === "dayTask") {
        const list = dayTasks[dateKey] || []
        const fromIndex = getDayTaskIndex(dateKey, taskId)
        if (fromIndex < 0) return
        const [item] = list.splice(fromIndex, 1)
        if (list.length === 0) delete dayTasks[dateKey]
        else dayTasks[dateKey] = list

        if (toBucket === "nonNegotiable") {
            const today = todayLocalISO()
            const nnItem = {
                id: item.id,
                text: item.text,
                startDate: today,
                endDate: null
            }
            nonNegotiables.splice(getFullIndexForActiveInsert(insertIndex, today), 0, nnItem)
            if (!nonNegotiableCompletions[dateKey]) {
                nonNegotiableCompletions[dateKey] = {}
            }
            nonNegotiableCompletions[dateKey][item.id] = Boolean(item.completed)
            savePlannerData()
        } else if (toBucket === "bonus") {
            insertAt(tasks, {
                id: item.id,
                text: item.text,
                completed: Boolean(item.completed),
                dueDate: dueDateOnBonus || ""
            }, insertIndex)
            saveTasks()
            savePlannerData()
        }
        refreshAllViews()
        return
    }

    if (fromBucket === "bonus") {
        const fromIndex = getBonusIndex(taskId)
        if (fromIndex < 0) return
        const [item] = tasks.splice(fromIndex, 1)

        if (toBucket === "dayTask") {
            if (!dayTasks[dateKey]) dayTasks[dateKey] = []
            insertAt(dayTasks[dateKey], {
                id: item.id,
                text: item.text,
                completed: Boolean(item.completed)
            }, insertIndex)
            savePlannerData()
            saveTasks()
        } else if (toBucket === "nonNegotiable") {
            const today = todayLocalISO()
            const nnItem = {
                id: item.id,
                text: item.text,
                startDate: today,
                endDate: null
            }
            nonNegotiables.splice(getFullIndexForActiveInsert(insertIndex, today), 0, nnItem)
            if (!nonNegotiableCompletions[dateKey]) {
                nonNegotiableCompletions[dateKey] = {}
            }
            nonNegotiableCompletions[dateKey][item.id] = Boolean(item.completed)
            savePlannerData()
            saveTasks()
        }
        refreshAllViews()
    }
}

function setupDropZone(element, bucket, dateKey = "") {
    if (!element) return
    element.classList.add("task-drop-zone")
    element.dataset.dropZone = bucket
    if (dateKey) element.dataset.dateKey = dateKey
}

function clearDragUI() {
    document.querySelectorAll(".task-row.drop-target").forEach(row => {
        row.classList.remove("drop-target")
    })
    document.querySelectorAll(".task-drop-zone.drop-zone-active").forEach(zone => {
        zone.classList.remove("drop-zone-active")
    })
}

function getDraggableRows(listRoot, excludeTaskId) {
    if (!listRoot) return []
    return [...listRoot.querySelectorAll(".task-row[data-task-id]")].filter(
        row => row.dataset.taskId !== excludeTaskId
    )
}

function getVisibleInsertIndex(listRoot, clientY, excludeTaskId) {
    const rows = getDraggableRows(listRoot, excludeTaskId)
    for (let i = 0; i < rows.length; i += 1) {
        const rect = rows[i].getBoundingClientRect()
        if (clientY < rect.top + rect.height / 2) return i
    }
    return rows.length
}

function getBonusArrayInsertIndex(listRoot, clientY, excludeTaskId) {
    const rows = getDraggableRows(listRoot, excludeTaskId)
    const visibleInsert = getVisibleInsertIndex(listRoot, clientY, excludeTaskId)

    const visibleIds = rows.map(row => row.dataset.taskId)
    if (visibleInsert >= visibleIds.length) {
        return tasks.length
    }

    const targetId = visibleIds[visibleInsert]
    const fullIndex = tasks.findIndex(task => task.id === targetId)
    return fullIndex >= 0 ? fullIndex : tasks.length
}

function resolveInsertIndex(dropZone, clientY, excludeTaskId, targetBucket) {
    if (!dropZone) return 0
    if (targetBucket === "bonus") {
        return getBonusArrayInsertIndex(dropZone, clientY, excludeTaskId)
    }
    return getVisibleInsertIndex(dropZone, clientY, excludeTaskId)
}

function attachTaskDrag(handle, row, dragMeta) {
    const DRAG_THRESHOLD = 6
    let drag = null

    handle.addEventListener("pointerdown", function(event) {
        if (event.pointerType === "mouse" && event.button !== 0) return
        event.preventDefault()
        handle.setPointerCapture(event.pointerId)
        drag = {
            taskId: dragMeta.taskId,
            fromBucket: dragMeta.bucket,
            dateKey: dragMeta.dateKey,
            dueDateOnBonus: dragMeta.dueDateOnBonus || "",
            startY: event.clientY,
            started: false,
            insertIndex: null,
            targetBucket: dragMeta.bucket,
            targetList: row.parentElement
        }
    })

    handle.addEventListener("pointermove", function(event) {
        if (!drag || drag.taskId !== dragMeta.taskId) return
        if (!drag.started) {
            if (Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD) return
            drag.started = true
            row.classList.add("is-dragging")
            document.body.classList.add("is-reordering")
        }

        clearDragUI()
        const dropZone = document
            .elementFromPoint(event.clientX, event.clientY)
            ?.closest(".task-drop-zone")

        if (!dropZone) return

        dropZone.classList.add("drop-zone-active")
        const targetBucket = dropZone.dataset.dropZone
        const insertIndex = resolveInsertIndex(
            dropZone,
            event.clientY,
            dragMeta.taskId,
            targetBucket
        )

        drag.targetBucket = targetBucket
        drag.targetList = dropZone
        drag.insertIndex = insertIndex
        drag.dateKey = dropZone.dataset.dateKey || dragMeta.dateKey

        const rows = getDraggableRows(dropZone, dragMeta.taskId)
        const highlightIndex = targetBucket === "bonus"
            ? getVisibleInsertIndex(dropZone, event.clientY, dragMeta.taskId)
            : insertIndex
        if (highlightIndex < rows.length) {
            rows[highlightIndex].classList.add("drop-target")
        } else if (rows.length > 0) {
            rows[rows.length - 1].classList.add("drop-target")
        }
    })

    function endDrag(event) {
        if (!drag || drag.taskId !== dragMeta.taskId) return
        const {
            started,
            taskId,
            fromBucket,
            targetBucket,
            insertIndex,
            dateKey,
            dueDateOnBonus
        } = drag
        drag = null

        try {
            handle.releasePointerCapture(event.pointerId)
        } catch (error) {
            // Pointer may already be released.
        }

        row.classList.remove("is-dragging")
        document.body.classList.remove("is-reordering")
        clearDragUI()

        if (!started || insertIndex === null) return

        moveTask({
            fromBucket,
            toBucket: targetBucket || fromBucket,
            taskId,
            dateKey,
            insertIndex,
            dueDateOnBonus
        })
    }

    handle.addEventListener("pointerup", endDrag)
    handle.addEventListener("pointercancel", endDrag)
}

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
        week: document.getElementById("tab-week"),
        notes: document.getElementById("tab-notes")
    }
    const panels = {
        today: document.getElementById("panel-today"),
        planning: document.getElementById("panel-planning"),
        week: document.getElementById("panel-week"),
        notes: document.getElementById("panel-notes")
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
    } else if (tab === "week") {
        renderWeek()
    } else {
        renderNotes()
    }
}

function refreshAllViews() {
    renderToday()
    renderTasks()
    renderCalendar()
    renderSelectedDay()
    renderWeek()
    renderNotes()
}

function getTodayMergedProgress() {
    const today = todayLocalISO()
    const planned = dayTasks[today] || []
    const recurring = getNonNegotiablesForDate(today)
    const recurringDone = recurring.filter(item =>
        Boolean(nonNegotiableCompletions[today]?.[item.id])
    ).length
    const plannedDone = planned.filter(task => task.completed).length
    const total = recurring.length + planned.length
    const completed = recurringDone + plannedDone

    return {
        total,
        completed,
        percent: total === 0 ? 0 : Math.round((completed / total) * 100)
    }
}

function beginInlineEdit(span, currentText, onSave) {
    if (!span || span.dataset.editing === "1") return

    const input = document.createElement("input")
    input.type = "text"
    input.className = "inline-edit-input"
    input.value = currentText
    input.setAttribute("aria-label", "Edit task")
    span.dataset.editing = "1"
    span.replaceWith(input)
    input.focus()
    input.select()

    let finished = false

    function finish(save) {
        if (finished) return
        finished = true
        if (save) {
            const next = input.value.trim()
            onSave(next || currentText)
            return
        }
        const restored = document.createElement("span")
        restored.textContent = currentText
        if (span.className) restored.className = span.className
        input.replaceWith(restored)
    }

    input.addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
            event.preventDefault()
            finish(true)
        } else if (event.key === "Escape") {
            event.preventDefault()
            finish(false)
        }
    })
    input.addEventListener("blur", function() {
        finish(true)
    })
}

function createTaskRow(text, completed, onToggle, onDelete, options = {}) {
    const row = document.createElement("div")
    row.className = "task-row"

    if (options.drag) {
        row.dataset.bucket = options.drag.bucket
        row.dataset.taskId = options.drag.taskId
        if (options.drag.dateKey) {
            row.dataset.dateKey = options.drag.dateKey
        }

        const handle = document.createElement("button")
        handle.type = "button"
        handle.className = "drag-handle"
        handle.textContent = "⋮⋮"
        handle.setAttribute("aria-label", `Drag to move ${text}`)
        handle.setAttribute("title", "Drag to move")
        attachTaskDrag(handle, row, options.drag)
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
    if (options.onSaveText) {
        taskText.title = "Double-click to edit"
        taskText.addEventListener("dblclick", function(event) {
            event.preventDefault()
            event.stopPropagation()
            beginInlineEdit(taskText, text, options.onSaveText)
        })
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
        const dropWrap = document.createElement("div")
        dropWrap.className = "today-list task-drop-zone"
        dropWrap.dataset.dropZone = options.dropZone || ""
        if (options.dateKey) dropWrap.dataset.dateKey = options.dateKey

        const empty = document.createElement("p")
        empty.className = "today-empty"
        empty.textContent = options.empty || "Nothing here yet."
        dropWrap.appendChild(empty)
        group.appendChild(dropWrap)
    } else {
        const stack = document.createElement("div")
        stack.className = "today-list task-drop-zone"
        stack.dataset.dropZone = options.dropZone || ""
        if (options.dateKey) stack.dataset.dateKey = options.dateKey
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

    const activeNonNegotiables = getNonNegotiablesForDate(today)
    const recurringRows = activeNonNegotiables.map(item => {
        const completed = Boolean(nonNegotiableCompletions[today]?.[item.id])
        return createTaskRow(
            item.text,
            completed,
            function() {
                const previousPercent = getDayProgress(today).percent
                if (!nonNegotiableCompletions[today]) {
                    nonNegotiableCompletions[today] = {}
                }
                nonNegotiableCompletions[today][item.id] = !completed
                savePlannerData()
                refreshAllViews()
                maybeCelebrateDayComplete(today, previousPercent)
            },
            function() {
                deleteNonNegotiableFromToday(item.id)
            },
            {
                drag: {
                    bucket: "nonNegotiable",
                    taskId: item.id,
                    dateKey: today
                },
                onSaveText: function(newText) {
                    renameNonNegotiableFromToday(item.id, newText)
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
                const previousPercent = getDayProgress(today).percent
                task.completed = !task.completed
                savePlannerData()
                refreshAllViews()
                maybeCelebrateDayComplete(today, previousPercent)
            },
            function() {
                dayTasks[today] = planned.filter(current => current.id !== task.id)
                savePlannerData()
                refreshAllViews()
            },
            {
                drag: {
                    bucket: "dayTask",
                    taskId: task.id,
                    dateKey: today,
                    dueDateOnBonus: ""
                },
                onSaveText: function(newText) {
                    task.text = newText
                    savePlannerData()
                    refreshAllViews()
                }
            }
        )
    )

    const bonusRows = tasks.map(task => {
        let className = ""
        if (task.dueDate && !task.completed) {
            if (task.dueDate < today) className = "overdue"
            else if (task.dueDate === today) className = "due-today"
        }

        return createTaskRow(
            task.text,
            task.completed,
            function() {
                setBonusCompletedById(task.id, !task.completed)
            },
            function() {
                tasks = tasks.filter(current => current.id !== task.id)
                saveTasks()
                refreshAllViews()
            },
            {
                className,
                meta: task.dueDate ? `(${task.dueDate})` : "",
                drag: {
                    bucket: "bonus",
                    taskId: task.id,
                    dateKey: today
                },
                onSaveText: function(newText) {
                    task.text = newText
                    saveTasks()
                    refreshAllViews()
                }
            }
        )
    })

    appendGroup(list, "Daily non-negotiables", recurringRows, {
        icon: "⚡",
        accent: "group-flame",
        dropZone: "nonNegotiable",
        dateKey: today,
        done: activeNonNegotiables.filter(item =>
            Boolean(nonNegotiableCompletions[today]?.[item.id])
        ).length,
        empty: "Add your daily must-dos from the Planning tab."
    })
    appendGroup(list, "Planned for today", plannedRows, {
        icon: "🗓️",
        accent: "group-sky",
        dropZone: "dayTask",
        dateKey: today,
        done: planned.filter(task => task.completed).length,
        empty: "Nothing scheduled for today yet."
    })
    appendGroup(list, "Bonus", bonusRows, {
        icon: "⭐",
        accent: "group-mint",
        dropZone: "bonus",
        dateKey: today,
        done: tasks.filter(task => task.completed).length,
        empty: "Extra credit for this week. Completed bonus clears every Monday."
    })
}

function quickAddToday(event) {
    event.preventDefault()
    const input = document.getElementById("todayQuickAdd")
    const text = input.value.trim()
    if (!text) return

    tasks.push({
        id: generateTaskId(),
        text,
        completed: false,
        dueDate: ""
    })
    input.value = ""
    saveTasks()
    refreshAllViews()
}

function updateBonusSummary(remaining, total) {
    const meta = document.getElementById("bonusSummaryMeta")
    if (!meta) return
    if (total === 0) {
        meta.textContent = "empty"
        return
    }
    meta.textContent = remaining === 1 ? "1 open" : `${remaining} open`
}

function renderTasks() {
    let list = document.getElementById("taskList")
    if (!list) return

    setupDropZone(list, "bonus", selectedDate)
    list.innerHTML = ""

    let total = tasks.length
    let completed = tasks.filter(task => task.completed).length
    let remaining = total - completed

    updateBonusSummary(remaining, total)

    const visibleTasks = tasks.filter(taskMatchesFilters)

    if (tasks.length === 0) {
        let emptyMsg = document.createElement("p")
        emptyMsg.className = "empty-filter-msg"
        emptyMsg.textContent = "No bonus tasks yet. Add one here or from Today."
        list.appendChild(emptyMsg)
        return
    }

    if (visibleTasks.length === 0) {
        let emptyMsg = document.createElement("p")
        emptyMsg.className = "empty-filter-msg"
        emptyMsg.textContent = "Nothing in this filter. Try All or Open."
        list.appendChild(emptyMsg)
        return
    }

    visibleTasks.forEach(task => {
        let className = ""
        const today = todayLocalISO()
        if (task.dueDate && !task.completed) {
            if (task.dueDate < today) className = "overdue"
            else if (task.dueDate === today) className = "due-today"
        }

        list.appendChild(createTaskRow(
            task.text,
            task.completed,
            function() {
                setBonusCompletedById(task.id, !task.completed)
            },
            function() {
                tasks = tasks.filter(current => current.id !== task.id)
                saveTasks()
                refreshAllViews()
            },
            {
                className,
                meta: task.dueDate ? `(${task.dueDate})` : "",
                drag: {
                    bucket: "bonus",
                    taskId: task.id,
                    dateKey: selectedDate
                },
                onSaveText: function(newText) {
                    task.text = newText
                    saveTasks()
                    refreshAllViews()
                }
            }
        ))
    })
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
        id: generateTaskId(),
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
    let anyCompleted = false
    tasks.forEach(task => {
        if (!task.completed) {
            task.completed = true
            anyCompleted = true
        }
    })
    saveTasks()
    refreshAllViews()
    if (anyCompleted) celebrateConfetti()
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
    ;["all", "active", "completed"].forEach(name => {
        const button = document.getElementById("filter-" + name)
        if (!button) return
        button.classList.toggle("active-filter", name === filter)
    })
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
    const recurring = getNonNegotiablesForDate(dateKey)
    const recurringDone = recurring.filter(item =>
        Boolean(nonNegotiableCompletions[dateKey]?.[item.id])
    ).length
    const specificDone = specificTasks.filter(task => task.completed).length
    const total = recurring.length + specificTasks.length
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
    setupDropZone(recurringList, "nonNegotiable", selectedDate)
    setupDropZone(specificList, "dayTask", selectedDate)

    const activeNonNegotiables = getNonNegotiablesForDate(selectedDate)
    if (activeNonNegotiables.length === 0) {
        recurringList.appendChild(createPlannerEmpty("Add your first daily must-do above."))
    } else {
        activeNonNegotiables.forEach(item => {
            const completed = Boolean(
                nonNegotiableCompletions[selectedDate]?.[item.id]
            )
            recurringList.appendChild(createPlannerRow(
                item.text,
                completed,
                function() {
                    const previousPercent = getDayProgress(selectedDate).percent
                    if (!nonNegotiableCompletions[selectedDate]) {
                        nonNegotiableCompletions[selectedDate] = {}
                    }
                    nonNegotiableCompletions[selectedDate][item.id] = !completed
                    savePlannerData()
                    refreshAllViews()
                    maybeCelebrateDayComplete(selectedDate, previousPercent)
                },
                function() {
                    deleteNonNegotiableFromToday(item.id)
                },
                {
                    drag: {
                        bucket: "nonNegotiable",
                        taskId: item.id,
                        dateKey: selectedDate
                    },
                    onSaveText: function(newText) {
                        renameNonNegotiableFromToday(item.id, newText)
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
                    const previousPercent = getDayProgress(selectedDate).percent
                    task.completed = !task.completed
                    savePlannerData()
                    refreshAllViews()
                    maybeCelebrateDayComplete(selectedDate, previousPercent)
                },
                function() {
                    dayTasks[selectedDate] = tasksForDay.filter(
                        current => current.id !== task.id
                    )
                    savePlannerData()
                    refreshAllViews()
                },
                {
                    drag: {
                        bucket: "dayTask",
                        taskId: task.id,
                        dateKey: selectedDate,
                        dueDateOnBonus: selectedDate
                    },
                    onSaveText: function(newText) {
                        task.text = newText
                        savePlannerData()
                        refreshAllViews()
                    }
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

    createNonNegotiable(text)
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

const WEEK_VIEWS = ["pulse", "heatmap", "constellation"]
let weekView = localStorage.getItem("weekView") || "pulse"
if (!WEEK_VIEWS.includes(weekView)) weekView = "pulse"

function setWeekView(view) {
    if (!WEEK_VIEWS.includes(view)) return
    weekView = view
    localStorage.setItem("weekView", view)
    renderWeek()
}

function syncWeekViewChips() {
    document.querySelectorAll(".week-view-chip").forEach(chip => {
        const isActive = chip.dataset.weekView === weekView
        chip.classList.toggle("is-active", isActive)
        chip.setAttribute("aria-pressed", String(isActive))
    })

    const pulse = document.getElementById("weekViewPulse")
    const heatmap = document.getElementById("weekViewHeatmap")
    const constellation = document.getElementById("weekViewConstellation")
    if (!pulse || !heatmap || !constellation) return

    pulse.hidden = weekView !== "pulse"
    heatmap.hidden = weekView !== "heatmap"
    constellation.hidden = weekView !== "constellation"
    pulse.classList.toggle("is-active", weekView === "pulse")
    heatmap.classList.toggle("is-active", weekView === "heatmap")
    constellation.classList.toggle("is-active", weekView === "constellation")
}

function getWeekDayStats() {
    const today = todayLocalISO()
    return getWeekDatesMondayToSunday().map(({ date, dateKey }) => {
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
}

function renderWeekPulse(dayStats, avgPercent, activeDays) {
    const heroNote = document.getElementById("weekHeroNote")
    const bars = document.getElementById("weekBars")
    if (!bars) return

    setWeekRing(avgPercent)
    if (heroNote) {
        heroNote.textContent = activeDays === 0
            ? "No daily plans logged yet this week — start on Today or Planning."
            : `${activeDays} day${activeDays === 1 ? "" : "s"} with plans · Mon through Sun pulse.`
    }

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
}

function renderWeekHeatmap(dayStats, activeDays) {
    const note = document.getElementById("weekHeatmapNote")
    const grid = document.getElementById("weekHeatmap")
    if (!grid) return

    if (note) {
        note.textContent = activeDays === 0
            ? "Heatmap is quiet this week — complete daily plans to light up the squares."
            : "Warmer squares mean stronger days. Cooler means quieter ones."
    }

    grid.innerHTML = ""
    dayStats.forEach(day => {
        const cell = document.createElement("div")
        cell.className = `heatmap-cell tone-${day.tone}${day.isToday ? " is-today" : ""}${day.isFuture ? " is-future" : ""}`
        cell.style.setProperty("--heat", `${day.progress.percent}%`)
        cell.title = day.progress.total === 0
            ? `${day.date.toLocaleDateString(undefined, { weekday: "long" })}: no plans`
            : `${day.date.toLocaleDateString(undefined, { weekday: "long" })}: ${day.progress.completed}/${day.progress.total} (${day.progress.percent}%)`

        const name = document.createElement("span")
        name.className = "heatmap-day"
        name.textContent = day.date.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2)

        const value = document.createElement("strong")
        value.className = "heatmap-value"
        value.textContent = day.progress.total === 0 ? "—" : `${day.progress.percent}%`

        cell.append(name, value)
        grid.appendChild(cell)
    })
}

function renderWeekConstellation(dayStats, activeDays) {
    const note = document.getElementById("weekConstellationNote")
    const sky = document.getElementById("weekConstellation")
    if (!sky) return

    if (note) {
        note.textContent = activeDays === 0
            ? "No stars yet — each completed daily item becomes a glowing dot."
            : "Each glowing dot is a completed daily item for that day."
    }

    sky.innerHTML = ""
    dayStats.forEach(day => {
        const column = document.createElement("div")
        column.className = `constellation-day${day.isToday ? " is-today" : ""}${day.isFuture ? " is-future" : ""}`

        const name = document.createElement("span")
        name.className = "week-day-name"
        name.textContent = day.date.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2)

        const dots = document.createElement("div")
        dots.className = "constellation-dots"
        const count = Math.min(day.progress.completed, 10)
        if (count === 0) {
            const empty = document.createElement("span")
            empty.className = "constellation-empty"
            empty.textContent = "·"
            dots.appendChild(empty)
        } else {
            for (let i = 0; i < count; i += 1) {
                const dot = document.createElement("span")
                dot.className = "constellation-dot"
                dot.style.animationDelay = `${i * 0.05}s`
                dots.appendChild(dot)
            }
        }

        const value = document.createElement("span")
        value.className = "week-day-value"
        value.textContent = day.progress.completed === 0 ? "0" : String(day.progress.completed)

        column.append(name, dots, value)
        sky.appendChild(column)
    })
}

function renderWeek() {
    const rangeLabel = document.getElementById("weekRangeLabel")
    const summary = document.getElementById("weekSummary")
    const bonusNote = document.getElementById("weekBonusNote")
    if (!rangeLabel) return

    syncWeekViewChips()

    const weekDays = getWeekDatesMondayToSunday()
    const monday = weekDays[0].date
    const sunday = weekDays[6].date
    const dayStats = getWeekDayStats()

    rangeLabel.textContent = `${monday.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric"
    })} – ${sunday.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
    })}`

    const avgPercent = Math.round(
        dayStats.reduce((sum, day) => sum + day.progress.percent, 0) / 7
    )
    const strongDays = dayStats.filter(
        day => day.progress.total > 0 && day.progress.percent >= 80
    ).length
    const activeDays = dayStats.filter(day => day.progress.total > 0).length
    const bonusDone = getBonusCompletedInWeek()

    if (summary) {
        summary.textContent = `${strongDays} strong day${strongDays === 1 ? "" : "s"} · ${avgPercent}% avg`
    }

    if (weekView === "heatmap") {
        renderWeekHeatmap(dayStats, activeDays)
    } else if (weekView === "constellation") {
        renderWeekConstellation(dayStats, activeDays)
    } else {
        renderWeekPulse(dayStats, avgPercent, activeDays)
    }

    if (bonusNote) {
        bonusNote.textContent = bonusDone === 0
            ? "Bonus this week: none completed yet (extra credit, separate from daily pulse)."
            : `Bonus this week: ${bonusDone} completed (extra credit, separate from daily pulse).`
    }
}

if (localStorage.getItem("darkMode") === "enabled") {
    document.body.classList.add("dark-mode")
}

let notes = JSON.parse(localStorage.getItem("notes")) || []
let selectedNoteId = localStorage.getItem("selectedNoteId") || ""
let newNoteType = "text"
let isCreatingNote = false

function saveNotes() {
    localStorage.setItem("notes", JSON.stringify(notes))
}

function saveSelectedNoteId() {
    if (selectedNoteId) {
        localStorage.setItem("selectedNoteId", selectedNoteId)
    } else {
        localStorage.removeItem("selectedNoteId")
    }
}

function createNoteId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getSelectedNote() {
    return notes.find(note => note.id === selectedNoteId) || null
}

function touchNote(note) {
    note.updatedAt = Date.now()
}

function startNewNote() {
    isCreatingNote = true
    newNoteType = "text"
    const form = document.getElementById("newNoteForm")
    const titleInput = document.getElementById("newNoteTitle")
    if (form) form.hidden = false
    syncNewNoteTypeChips()
    if (titleInput) {
        titleInput.value = ""
        titleInput.focus()
    }
}

function cancelNewNote() {
    isCreatingNote = false
    const form = document.getElementById("newNoteForm")
    if (form) form.hidden = true
}

function setNewNoteType(type) {
    newNoteType = type === "checklist" ? "checklist" : "text"
    syncNewNoteTypeChips()
}

function syncNewNoteTypeChips() {
    const textChip = document.getElementById("noteTypeText")
    const checklistChip = document.getElementById("noteTypeChecklist")
    if (!textChip || !checklistChip) return
    textChip.classList.toggle("is-active", newNoteType === "text")
    checklistChip.classList.toggle("is-active", newNoteType === "checklist")
}

function createNote(event) {
    event.preventDefault()
    const titleInput = document.getElementById("newNoteTitle")
    const title = (titleInput?.value || "").trim() || "Untitled note"
    const note = {
        id: createNoteId(),
        title,
        type: newNoteType,
        body: "",
        items: [],
        updatedAt: Date.now()
    }
    notes.unshift(note)
    selectedNoteId = note.id
    isCreatingNote = false
    saveNotes()
    saveSelectedNoteId()
    cancelNewNote()
    renderNotes()
}

function selectNote(noteId) {
    selectedNoteId = noteId
    saveSelectedNoteId()
    renderNotes()
}

function updateSelectedNoteTitle(value) {
    const note = getSelectedNote()
    if (!note) return
    note.title = value.trim() || "Untitled note"
    touchNote(note)
    saveNotes()
    renderNotesListOnly()
}

function updateSelectedNoteBody(value) {
    const note = getSelectedNote()
    if (!note || note.type !== "text") return
    note.body = value
    touchNote(note)
    saveNotes()
}

function deleteSelectedNote() {
    const note = getSelectedNote()
    if (!note) return
    const confirmed = window.confirm(`Delete “${note.title}”?`)
    if (!confirmed) return
    notes = notes.filter(item => item.id !== note.id)
    selectedNoteId = notes[0]?.id || ""
    saveNotes()
    saveSelectedNoteId()
    renderNotes()
}

function addChecklistItem(event) {
    event.preventDefault()
    const note = getSelectedNote()
    if (!note || note.type !== "checklist") return
    const input = document.getElementById("checklistItemInput")
    const text = (input?.value || "").trim()
    if (!text) return
    note.items.push({
        id: createNoteId(),
        text,
        done: false
    })
    touchNote(note)
    input.value = ""
    saveNotes()
    renderNotes()
    input.focus()
}

function toggleChecklistItem(itemId) {
    const note = getSelectedNote()
    if (!note || note.type !== "checklist") return
    const item = note.items.find(entry => entry.id === itemId)
    if (!item) return
    item.done = !item.done
    touchNote(note)
    saveNotes()
    renderNotes()
}

function deleteChecklistItem(itemId) {
    const note = getSelectedNote()
    if (!note || note.type !== "checklist") return
    note.items = note.items.filter(entry => entry.id !== itemId)
    touchNote(note)
    saveNotes()
    renderNotes()
}

function clearCheckedNoteItems() {
    const note = getSelectedNote()
    if (!note || note.type !== "checklist") return
    note.items = note.items.filter(item => !item.done)
    touchNote(note)
    saveNotes()
    renderNotes()
}

function renderNotesListOnly() {
    const list = document.getElementById("notesList")
    if (!list) return
    list.innerHTML = ""

    if (notes.length === 0) {
        const empty = document.createElement("p")
        empty.className = "notes-list-empty"
        empty.textContent = "No notes yet."
        list.appendChild(empty)
        return
    }

    notes
        .slice()
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .forEach(note => {
            const button = document.createElement("button")
            button.type = "button"
            button.className = `note-list-item${note.id === selectedNoteId ? " is-selected" : ""}`
            button.onclick = function() {
                selectNote(note.id)
            }

            const title = document.createElement("span")
            title.className = "note-list-title"
            title.textContent = note.title || "Untitled note"

            const badge = document.createElement("span")
            badge.className = `note-type-badge badge-${note.type}`
            badge.textContent = note.type === "checklist" ? "Checklist" : "Text"

            button.append(title, badge)
            list.appendChild(button)
        })
}

function renderNotes() {
    const emptyState = document.getElementById("notesEmptyState")
    const editorActive = document.getElementById("notesEditorActive")
    const titleInput = document.getElementById("noteTitleInput")
    const bodyInput = document.getElementById("noteBodyInput")
    const checklistPanel = document.getElementById("noteChecklistPanel")
    const checklistItems = document.getElementById("noteChecklistItems")
    const typeBadge = document.getElementById("noteTypeBadge")
    const clearCheckedBtn = document.getElementById("clearCheckedBtn")
    const form = document.getElementById("newNoteForm")

    if (!notes.find(note => note.id === selectedNoteId)) {
        selectedNoteId = notes[0]?.id || ""
        saveSelectedNoteId()
    }

    if (form) form.hidden = !isCreatingNote
    renderNotesListOnly()

    const note = getSelectedNote()
    if (!note) {
        if (emptyState) emptyState.hidden = false
        if (editorActive) editorActive.hidden = true
        return
    }

    if (emptyState) emptyState.hidden = true
    if (editorActive) editorActive.hidden = false

    if (titleInput && document.activeElement !== titleInput) {
        titleInput.value = note.title || ""
    }

    if (typeBadge) {
        typeBadge.className = `note-type-badge badge-${note.type}`
        typeBadge.textContent = note.type === "checklist" ? "Checklist" : "Text"
    }

    if (note.type === "text") {
        if (bodyInput) {
            bodyInput.hidden = false
            if (document.activeElement !== bodyInput) {
                bodyInput.value = note.body || ""
            }
        }
        if (checklistPanel) checklistPanel.hidden = true
        if (clearCheckedBtn) clearCheckedBtn.hidden = true
    } else {
        if (bodyInput) bodyInput.hidden = true
        if (checklistPanel) checklistPanel.hidden = false
        if (clearCheckedBtn) {
            clearCheckedBtn.hidden = !note.items.some(item => item.done)
        }
        if (checklistItems) {
            checklistItems.innerHTML = ""
            if (note.items.length === 0) {
                checklistItems.appendChild(createPlannerEmpty("Add items for groceries, shopping, and more."))
            } else {
                note.items.forEach(item => {
                    checklistItems.appendChild(createTaskRow(
                        item.text,
                        item.done,
                        function() {
                            toggleChecklistItem(item.id)
                        },
                        function() {
                            deleteChecklistItem(item.id)
                        }
                    ))
                })
            }
        }
    }
}

const filterAll = document.getElementById("filter-all")
if (filterAll) filterAll.classList.add("active-filter")
const allowedTabs = ["today", "planning", "week", "notes"]
switchTab(allowedTabs.includes(currentTab) ? currentTab : "today")
