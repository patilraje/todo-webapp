let tasks = JSON.parse(localStorage.getItem("tasks")) || []

function renderTasks() {

    let list = document.getElementById("taskList")
    list.innerHTML = ""

    tasks.forEach((task, index) => {

        let li = document.createElement("li")

        // Checkbox
        let checkbox = document.createElement("input")
        checkbox.type = "checkbox"
        checkbox.checked = task.completed

        checkbox.onchange = function(){
            tasks[index].completed = checkbox.checked
            saveTasks()
            renderTasks()
        }

        // Task text
        let span = document.createElement("span")
        span.textContent = task.text

        if(task.completed){
            span.classList.add("completed")
        }

        // ❌ Remove click delete from text (better UX)
        // span.onclick = function(){ ... }

        // 🗑️ Delete button (NEW FEATURE)
        let deleteBtn = document.createElement("button")
        deleteBtn.textContent = "❌"

        deleteBtn.onclick = function(){
            tasks.splice(index, 1)
            saveTasks()
            renderTasks()
        }

        li.appendChild(checkbox)
        li.appendChild(span)
        li.appendChild(deleteBtn)

        list.appendChild(li)
    })

    // Task counter
    let remaining = tasks.filter(task => !task.completed).length

    document.getElementById("taskCount").textContent =
        remaining === 1 ? "1 task remaining" : remaining + " tasks remaining"
}

function addTask(){

    let input = document.getElementById("taskInput")
    let text = input.value.trim()

    if(text === "") return

    tasks.push({
        text: text,
        completed: false
    })

    saveTasks()
    renderTasks()

    input.value = ""
}

// FIXED ENTER KEY (runs after page loads)
document.addEventListener("DOMContentLoaded", function() {
    document.getElementById("taskInput").addEventListener("keydown", function(event){
        if(event.key === "Enter"){
            addTask()
        }
    })
})

function saveTasks(){
    localStorage.setItem("tasks", JSON.stringify(tasks))
}

renderTasks()