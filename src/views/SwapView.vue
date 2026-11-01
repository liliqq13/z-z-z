<template>
  <div>
    <!-- Swap -->
    <div class="card">
      <div class="card-title">🔄 调休 / 换班</div>
      <div class="form-row">
        <div class="form-group">
          <label>人员 A</label>
          <select v-model="swapForm.staffA">
            <option value="">请选择</option>
            <option v-for="s in store.staff" :key="s.id" :value="s.id">{{ s.name }}（{{ s.group }}组）</option>
          </select>
        </div>
        <div class="form-group">
          <label>A 的日期</label>
          <input type="date" v-model="swapForm.dateA">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>人员 B</label>
          <select v-model="swapForm.staffB">
            <option value="">请选择</option>
            <option v-for="s in store.staff" :key="s.id" :value="s.id">{{ s.name }}（{{ s.group }}组）</option>
          </select>
        </div>
        <div class="form-group">
          <label>B 的日期</label>
          <input type="date" v-model="swapForm.dateB">
        </div>
      </div>
      <div class="form-group">
        <label>换班原因（可选）</label>
        <input type="text" v-model="swapForm.reason" placeholder="如：调休、家事等">
      </div>
      <div style="text-align:center;margin-top:16px;">
        <button class="btn btn-warning" @click="doSwap">🔄 确认换班</button>
      </div>
    </div>

    <!-- Leave -->
    <div class="card">
      <div class="card-title">🏖️ 请假 / 调休标记</div>
      <div class="form-row">
        <div class="form-group">
          <label>选择人员</label>
          <select v-model="leaveForm.staff">
            <option value="">请选择</option>
            <option v-for="s in store.staff" :key="s.id" :value="s.id">{{ s.name }}（{{ s.group }}组）</option>
          </select>
        </div>
        <div class="form-group">
          <label>请假日期</label>
          <input type="date" v-model="leaveForm.date">
        </div>
      </div>
      <div class="form-group">
        <label>原因</label>
        <input type="text" v-model="leaveForm.reason" placeholder="如：调休、病假、事假等">
      </div>
      <div style="text-align:center;margin-top:16px;">
        <button class="btn btn-danger" @click="doLeave">🏖️ 标记请假/调休</button>
      </div>
    </div>

    <!-- Records -->
    <div class="card">
      <div class="card-title">📋 换班/请假记录</div>
      <div v-if="store.swapRecords.length === 0" class="empty-state" style="padding:20px;">
        <p>暂无换班记录</p>
      </div>
      <div v-for="r in store.swapRecords" :key="r.id" class="swap-record"
           :style="{ borderLeft: r.type === 'leave' ? '3px solid var(--warning)' : '3px solid var(--primary)' }">
        <div class="swap-info">
          <template v-if="r.type === 'leave'">
            <div>🏖️ <strong>{{ r.staffAName }}</strong>（{{ r.dateA }}）
              <span style="color:var(--warning);font-weight:600;">请假/调休</span>
            </div>
          </template>
          <template v-else>
            <div>🔄 <strong>{{ r.staffAName }}</strong>（{{ r.dateA }}） ↔
              <strong>{{ r.staffBName }}</strong>（{{ r.dateB }}）
            </div>
          </template>
          <div style="font-size:12px;color:var(--text-light);margin-top:2px;">原因：{{ r.reason }}</div>
          <div class="swap-time">{{ r.time }}</div>
        </div>
        <span class="swap-delete" @click="store.deleteRecord(r.id)">🗑️</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive } from 'vue'
import { useSchedulerStore } from '../stores/scheduler'

const store = useSchedulerStore()

const swapForm = reactive({ staffA: '', staffB: '', dateA: '', dateB: '', reason: '' })
const leaveForm = reactive({ staff: '', date: '', reason: '' })

function doSwap() {
  const { staffA, staffB, dateA, dateB, reason } = swapForm
  if (!staffA || !staffB || !dateA || !dateB) return alert('请完整填写换班信息')
  if (staffA === staffB && dateA === dateB) return alert('不能与自己同一天换班')
  store.doSwap(staffA, staffB, dateA, dateB, reason)
  Object.assign(swapForm, { staffA: '', staffB: '', dateA: '', dateB: '', reason: '' })
  alert('换班成功！')
}

function doLeave() {
  const { staff, date, reason } = leaveForm
  if (!staff || !date) return alert('请选择人员和日期')
  store.markLeave(staff, date, reason || '调休')
  Object.assign(leaveForm, { staff: '', date: '', reason: '' })
  alert('已标记请假/调休')
}
</script>
